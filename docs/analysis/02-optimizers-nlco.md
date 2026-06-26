# TreeMaker 5 — Numerical Optimization Subsystem Analysis

Scope: `Source/tmModel/{tmOptimizers,tmSolvers,tmNLCO,wnlib}`.

## 0. Headline findings

- **Default/only compiled backend is ALM** (Augmented Lagrangian Multiplier), Lang's own code. In `tmNLCO/tmNLCO.h:29-32` only `#define tmUSE_ALM` is active; CFSQP, RFSQP, WNLIB are all commented out.
- **CFSQP and RFSQP source is not even in the repository.** Only the adapter classes `tmNLCO_cfsqp.*` / `tmNLCO_rfsqp.*` exist; they `#include "cfsqp.c"`, `qld.c`, `rfsqp.c` (`tmNLCO_cfsqp.cpp:15-18`) which are absent. They cannot compile as-is and are licensing-encumbered anyway.
- **wnlib is explicitly public domain** — its own header (`wnlib/low/wnlib.h`, `wnlib/low/wnport.h`) states it "is in the public domain and therefore may be used by anybody for any purpose."
- The whole subsystem is **pure C++/STL + one public-domain C library**, no wxWidgets/GUI/platform dependencies. Excellent Emscripten candidate.
- Note: in this snapshot, a grep for the optimizer classes finds them only inside their own folders **plus** `test/tmModelTester` (which drives all three) — and the GUI Action menu (`tmwxDoc_Action.cpp`) invokes them too. (The original report understated this; corrected here.)

## 1. The optimization problem (circle/river packing)

For any two leaf nodes, their distance on the square paper must be **≥ scale × (tree path length between them)**. Each leaf is the center of a circle of radius = its scaled distance to the nearest branch; the constraint forbids circle overlap (rivers generalize this to edge strain). Packing these circles tightly = making the model as large as possible from the given paper.

Three optimizers, all subclasses of `tmOptimizer` (`tmOptimizers/tmOptimizer.h`), each map tree state ↔ a flat `std::vector<double>` state vector via `TreeToData()`/`DataToTree()`:

**A. `tmScaleOptimizer`** (`tmScaleOptimizer.cpp`) — the classic packing.
- Variables: `[scale, x0,y0, x1,y1, …]` for all leaf nodes (`mNumVars = 1 + 2n`, line 42).
- Objective: **maximize scale** → `Func` returns `-u[0]` (line 180), gradient `[-1,0,…]`.
- Constraints: for each leaf path, `PathFn1`/`PathFn2`: `u[0]*lij − dist(node_i,node_j) ≤ 0` (`tmConstraintFns.cpp:151`). Analytic gradients (line 161).
- Bounds: scale ∈ [0,2], coords ∈ [0,paperW]×[0,paperH] (lines 49-61).

**B. `tmEdgeOptimizer`** (`tmEdgeOptimizer.cpp`) — uniformly strain a set of edges. Variables `[strain, x…,y…]`; objective `-u[0]`; constraints `StrainPathFn1/2/3` split each path into fixed length `lfix` + stretchable `lvar` (lines 106-127).

**C. `tmStrainOptimizer`** (`tmStrainOptimizer.cpp`) — independent per-edge strains, minimum-energy. Variables: node coords + one strain per stretchy edge (`edgeOffset = 2n`, line 48). Objective: **minimize stiffness-weighted mean-square strain** `Σ stiffness_i·u_i²` (`Func` line 273, analytic grad line 292). Constraints `MultiStrainPathFn1/2/3`.

**Constraint-function library** (`tmConstraintFns.h/.cpp`, ~1670 lines): ~25 small `tmDifferentiableFn` classes, each implementing `Func` (scalar) + analytic `Grad` (vector). Beyond path/strain constraints these encode every TreeMaker "Condition": `PathAngleFn`, `StickToEdgeFn`/`StickToLineFn`, `PairFn1A/B`/`PairFn2A/B`, `CollinearFn1/2/3`, `BoundaryFn`, `QuantizeAngleFn1/2`, `LocalizeFn`, `CornerFn`. Conditions inject these via `aCondition->AddConstraints(this)` (e.g. `tmScaleOptimizer.cpp:90-92`). All gradients hand-coded — no finite differencing.

## 2. The solver stack

```
tmScale/Edge/StrainOptimizer  (problem builders, tmOptimizers/)
        │  builds objective + constraints as tmDifferentiableFn objects
        ▼
tmNLCO  (abstract NLCO interface, tmNLCO/tmNLCO.h)
        │  SetObjective / AddNonlinearInequality / SetBounds / Minimize(x)
        ▼
tmNLCO_alm | tmNLCO_cfsqp | tmNLCO_rfsqp | tmNLCO_wnlib  (backends)
```

- `tmOptimizer::Optimize()` (`tmOptimizer.cpp:44`) calls `mNLCO->Minimize(scratchState)`, then `DataToTree()`. Non-zero return → throws `tmNLCO::EX_BAD_CONVERGENCE`.
- Backend selection is **compile-time** (`#define tmUSE_*`) with a static runtime default in `tmNLCO.cpp:38-49` and factory `tmNLCO::MakeNLCO()` (`tmNLCO.cpp:78`).

| Backend | What it is | Status | License |
|---|---|---|---|
| **ALM** (`tmNLCO_alm.cpp`, ~680 lines) | Lang's Augmented Lagrangian + BFGS quasi-Newton inner loop | **Default & only compiled** | Lang's, distributable |
| **CFSQP** (`tmNLCO_cfsqp.cpp` adapter only) | Feasible SQP (Maryland/AEM Design). Used in TM4. Fastest. | adapter only; **source absent** | **Proprietary, non-redistributable** |
| **RFSQP** (`tmNLCO_rfsqp.cpp` adapter only) | Refined FSQP, AEM Design eval copy | adapter only; **source absent** | **Non-redistributable** |
| **wnlib** (`tmNLCO_wnlib.cpp` + `wnlib/`) | `wn_nlp` conjugate-direction NLP (Naylor/Chapman) | full source, not compiled | **Public domain** |

**ALM algorithm (the one that matters):** `tmNLCO_alm::Minimize` (line 173) runs an outer loop (≤50 iters) increasing a penalty weight (10→×10→1e8, lines 179-184) and updating Lagrange multipliers for equalities/inequalities/bounds (lines 211-289), checking worst-case feasibility (TOL 1e-5). Inner loop `MinimizeAugLag` (line 353) is a **BFGS quasi-Newton minimizer** (inverse-Hessian update, ≤200 iters) with cubic-backtracking line search `LineSearchAugLag` (line 470) — essentially Numerical Recipes `dfpmin`/`lnsrch`. Augmented-Lagrangian objective+gradient are `AugLagFn`/`AugLagGrad` (lines 563/608). Depends only on `tmMatrix<double>` and STL. ALM is slower than CFSQP but more robust against spurious infeasible traps.

**Newton-Raphson & StubFinder (separate solver, not the packer):**
- `tmNewtonRaphson<T>` (`tmSolvers/tmNewtonRaphson.h`, header-only): multidimensional Newton root-finder with in-house `LUDecomposition`/`LUBackSubstitution` (Crout + partial pivot). Throws `EX_SINGULAR_MATRIX`/`EX_TOO_MANY_ITERATIONS`.
- `tmStubFinder` (`tmSolvers/tmStubFinder.cpp/.h`): privately inherits `tmNewtonRaphson<tmFloat>`. After a packing, solves for "stubs" — new nodes on edges creating 4+ simultaneously-active paths (degenerate polygons the molecule generator needs). Enumerates 4-node+1-edge combos (`TestOneCombo`). Part of CP *construction*, downstream of packing.
- `tmMatrix<T>` (`tmSolvers/tmMatrix.h`): trivial dense row-major matrix over `std::vector`.

## 3. Interfaces (in/out of the tree model)

**Inputs read from `tmTree`** (each optimizer's `Initialize`): leaf node list (`GetLeafNodes`/`FilterLeafNodes`), node coords (`GetLocX/Y`), scale (`GetScale`), paper size; owned paths (`GetOwnedPaths`), `IsLeafPath`, per-path tree length (`GetMinTreeLength`) and edge decomposition (`GetEdges`/`GetLength`/`GetStrain`/`GetStrainedScaledLength`/`GetStiffness`); active conditions (`GetConditions`) which self-register constraints via `tmCondition::AddConstraints(optimizer)`.

**Outputs written back** (`DataToTree`, after `Minimize`): new `scale` (scale optimizer), node positions (`SetLocX/Y`), edge strains (`SetStrain`). `tmOptimizer` derives from `tmTreeCleaner` and snapshots the tree (`PutSelf`/`GetSelf` to a `stringstream`) so the optimization is revertible (`Revert()`).

**Callback contract:** everything passed to the solver is a `tmDifferentiableFn` (`tmNLCO.h:55`): pure virtual `double Func(vector<double>& x)` and `void Grad(vector<double>& x, vector<double>& gradx)`. Objectives ping the UI via `GetNLCO()->ObjectiveUpdateUI()` and stash live state into `mCurrentStateVec`. Progress/cancel abstracted through `tmNLCOUpdater::UpdateUI()` (`tmNLCO.h:92`) — maps cleanly to a JS progress callback / Web Worker postMessage.

## 4. Performance characteristics

**This is the compute-heavy core.** Doubly iterative: outer penalty loop (≤50) × inner BFGS loop (≤200) × line search; every inner step calls `AugLagFn`/`AugLagGrad`, looping over *all* constraints. With `n` leaves the state vector is `2n+1` and nonlinear path constraints are up to **O(n²)** (all leaf pairs). Plus O(n²) BFGS inverse-Hessian update and O(n²) storage (`tmMatrix hess_inv(mSize,mSize)`). Non-convex, multi-modal (many local optima — why ALM's robustness was chosen). For real models (tens of nodes) a solve is sub-second to a few seconds native; the StubFinder combinatorial enumeration can also be non-trivial. Exactly the tight numeric loop where **Wasm pays off** vs. interpreted JS.

(The "220 moves" figure in CLAUDE.md is for an unrelated project (Siam) and is not relevant here.)

## 5. WebAssembly port assessment

**Cleanliness:** very clean. Pure C++/STL + one public-domain C library. No wxWidgets, OS calls, threads, or file I/O in the math path. Only host hooks are `tmHeader` macros (`TMASSERT`, `TMFAIL`, `TMLOG`, `TM_CHECK_NAN`) and the `tmNLCOUpdater` callback — all trivially Emscripten-mappable. `#pragma mark` blocks are inert.

**Licensing for web distribution:**
- **ALM** — Lang's own, fully distributable. ✅
- **wnlib** — explicit **public domain**. ✅ (~21k LOC, but only the `wn_nlp` conjdir subset + vect/mat/mem/random/low support is needed.)
- **CFSQP / RFSQP** — ❌ **Do not port.** Proprietary, non-redistributable; source isn't present anyway. Drop the adapter files or keep them `#ifdef`-stubbed.

**Recommendation:**
1. **Port ALM as the primary (likely sole) backend.** Compile `tmNLCO`, `tmNLCO_alm`, `tmConstraintFns`, the three `tm*Optimizer`, `tmNewtonRaphson`/`tmStubFinder`/`tmMatrix` with Emscripten into one Wasm module; expose entry points via Embind; map `tmNLCOUpdater` to a JS progress/cancel callback; run in a Web Worker.
2. **Skip CFSQP/RFSQP entirely.**
3. **wnlib optional** — only for a benchmarking/fallback second algorithm; leave `tmUSE_WNLIB` off for v1.
4. **Do not swap in a JS solver** — Wasm-compiled ALM is faster and far less work than re-deriving the augmented-Lagrangian machinery in JS.
5. **Re-wire the caller** — supply the driver logic (build optimizer, `Initialize`, `Optimize`, handle `EX_BAD_CONVERGENCE`/`EX_NO_MOVING_NODES`).

**Key files:**
- `tmModel/tmNLCO/tmNLCO.h` (interface + backend `#define` switches)
- `tmModel/tmNLCO/tmNLCO_alm.cpp` (the algorithm to port)
- `tmModel/tmOptimizers/tmConstraintFns.{h,cpp}` (constraint geometry + analytic gradients)
- `tmModel/tmOptimizers/{tmScale,tmEdge,tmStrain}Optimizer.cpp` (problem builders)
- `tmModel/tmSolvers/{tmNewtonRaphson.h,tmStubFinder.cpp,tmMatrix.h}` (post-packing construction)
- `tmModel/tmNLCO/README.txt`, `tmModel/wnlib/README.txt` (licensing)
