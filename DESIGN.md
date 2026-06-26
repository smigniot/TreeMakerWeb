# TreeMakerWeb — Design

A browser port of **TreeMaker 5** (Robert J. Lang), the origami crease-pattern
design program that uses the *circle/river packing* algorithm.

This document is the output of the analysis phase (see `PLAN.md`). The original
C++/wxWidgets source is vendored under `Orig/` (cloned from
`github.com/bugfolder/treemaker`). All file references below are relative to
`Orig/Source/`.

> **Detailed reference:** this file is the distilled design. The long-form
> subsystem analyses (with exact `file:function` and line citations) live in
> [`docs/analysis/`](docs/analysis/README.md) — read those when implementing.

> Status: **analysis complete, design decided, awaiting go for implementation.**
> The §9 decisions are locked (engine = hybrid with solver+geometry in Wasm;
> scope = phased MVP, viewer/editor first; rendering = pure SVG; native format =
> JSON with legacy import/export). Remaining minor confirmations are flagged in
> §9.

---

## 1. What the program does (domain primer)

The user draws a **tree graph** — a stick-figure of the origami subject (body =
edges, flap tips = leaf nodes). Each edge has a length. TreeMaker then computes
the **crease pattern** for a square of paper that folds into a *base* with one
flap per tree edge, scaled as large as possible.

The mathematical heart is **circle/river packing**: each leaf node is the center
of a circle whose radius is its scaled distance into the tree; circles may not
overlap, and "rivers" generalize this to interior edges. Packing them as tightly
as possible *maximizes the scale* (the model size for the given paper). From a
valid packing, the program builds polygons → a "molecule" crease pattern in each
→ vertices/creases → facets → a layer ordering and mountain/valley assignment.

Pipeline at a glance:

```
 tree (nodes+edges)  --pack-->  scaled node positions
        |                              |
   conditions  ------------------> (constraints fed to the optimizer)
        |                              v
        +--------> polygons --> molecules --> vertices+creases --> facets
                                                                     |
                                                          facet order + M/V
                                                                     |
                                                              CREASE PATTERN
```

---

## 2. Source inventory & metrics

| Layer | Path | LOC | wxWidgets? | Role |
|---|---|---:|:--:|---|
| Pointer/container utils | `tmModel/tmPtrClasses` | ~1.3k | no | `tmArray`, dangle-proof pointers |
| Core data + geometry | `tmModel/tmTreeClasses` | ~19.7k | no | tree, paths, polys, vertices, creases, facets, **conditions**, I/O |
| Optimizers | `tmModel/tmOptimizers` | ~3.3k | no | scale/edge/strain problem builders + constraint fns |
| Solvers | `tmModel/tmSolvers` | ~0.7k | no | Newton-Raphson, stub finder, matrix |
| NLP backends | `tmModel/tmNLCO` | ~2.3k | no | ALM (used), CFSQP/RFSQP (absent), wnlib adapter |
| 3rd-party NLP | `tmModel/wnlib` | ~21k | no | public-domain numerics (optional) |
| **Model total** | `tmModel` | **~49k** | **no** | the engine |
| GUI | `tmwxGUI` | ~21k | **yes** | app/doc/view, canvas, inspector, palettes, dialogs |

**Key structural fact:** `tmModel` has **zero GUI/OS dependencies** and already
builds & runs headless via `test/tmModelTester` — see §7. The model/GUI split is
clean and is the natural seam for the port.

---

## 3. Model architecture (from analysis)

### 3.1 Object model

`tmPart` is the base of every persistent object (back-pointer to `tmTree`,
1-based `mIndex`, a 4-char type tag for I/O). The hierarchy:

- **Authored by the user:** `tmNode`, `tmEdge` (the tree); `tmCondition` (13
  subclasses, the constraints).
- **Derived/computed:** `tmPath` (routes between nodes; *active* = taut at min
  length), `tmPoly` (+ recursive subpolys = molecules), `tmVertex`, `tmCrease`
  (kind ∈ axial/gusset/ridge/hinge/pseudohinge; fold ∈ flat/M/V/border),
  `tmFacet` (layer order + color).

`tmTree` owns everything via two parallel registries: a flat per-type registry
(`tmCluster`) and a hierarchical ownership tree (`tm*Owner` mixins that handle
`delete`). **Every part is registered twice.**

### 3.2 Dirty model

A single `mNeedsCleanup` flag, driven by an RAII guard `tmTreeCleaner` on every
mutating method. On the outermost edit's scope-exit it runs
`tmTree::CleanupAfterEdit()`, which rebuilds *all* derived state (no incremental
invalidation). Validity flags (`mIsFeasible`, `mIsPolygonValid`,
`mIsPolygonFilled`, `mIsVertexDepthValid`, `mIsFacetDataValid`,
`mIsLocalRootConnectable`) record how far CP generation got;
`GetCPStatus()` returns a diagnostic enum + offending parts.

### 3.3 The dangle-proof pointer system (`tmDpptr*`)

Because the model is a densely cross-linked graph, a single `delete` must ripple
through dozens of back-references and both registries. `tmDpptrTarget` (base of
every part) tracks who points at it; `tmDpptr<T>` auto-nulls on target delete;
`tmDpptrArray<T>` auto-removes dead slots. This is an eager weak-reference /
observer mechanism standing in for what a GC + explicit cleanup would do.

**Port stance:** *do not port the dpptr layer.* Replace with integer/string IDs
+ arrays as the source of truth, deriving the flat registries on demand and
writing explicit removal at delete sites. RAII (`tmTreeCleaner`, dpptr
destructors) has no JS equivalent → use explicit `beginEdit()/endEdit()`
(depth-counted) and explicit `dispose()`.

### 3.4 Algorithmic stages (all in `tmModel`, GUI-independent)

1. **Tree editing** — `tmTree::AddNode/SplitEdge/Absorb*` etc. Pure graph
   bookkeeping (incrementally maintains each node's leaf-path set).
2. **Packing (numeric)** — `tmScaleOptimizer` / `tmEdgeOptimizer` /
   `tmStrainOptimizer` → `tmNLCO` → **ALM** backend. Maximize scale (or edge
   strain) / minimize strain subject to path & condition constraints.
3. **Cleanup pipeline** — `CleanupAfterEdit`: convex hull (border), polygon
   network fixpoint, depth propagation, validity checks.
4. **Molecule / crease construction** — `BuildPolysAndCreasePattern` →
   `tmPoly::CalcContents` recursion (insetting, ridgelines, spokes); the
   heaviest, most numerically delicate geometry. `tmStubFinder` (Newton-Raphson)
   adds stub nodes for degenerate 4+-active-path polygons.
5. **Facet ordering** — `tmTree_FacetOrder.cpp`: build local root networks,
   splice into one graph, topologically assign layer order; then color & M/V.

### 3.5 Conditions (user constraints)

13 types, each emitting one or more `tmDifferentiableFn` constraints into the
optimizer via `AddConstraints(optimizer)`. Two modern "combo" types
(`tmConditionNodeCombo`/`tmConditionPathCombo`) unify the v4 building blocks.

| Type | Tag | Constrains |
|---|---|---|
| NodeFixed | `CNfn` | node coord(s) fixed |
| NodeOnEdge | `CNen` | node on paper edge |
| NodeOnCorner | `CNkn` | node on paper corner |
| NodeSymmetric | `CNsn` | node on symmetry line |
| NodesPaired | `CNpn` | two nodes mirror across symmetry |
| NodesCollinear | `CNcn` | three nodes collinear |
| EdgeLengthFixed | `CNfe` | edge strain = 0 |
| EdgesSameStrain | `CNes` | two edges equal strain |
| PathActive | `CNap` | leaf path taut at min length |
| PathAngleFixed | `CNfp` | active path, angle fixed |
| PathAngleQuant | `CNqp` | active path, angle quantized |
| NodeCombo | `CNxn` | union of node conditions (v5) |
| PathCombo | `CNxp` | union of path conditions (v5) |

`CalcFeasibility()` evaluates the same constraint `Func`s against current
geometry (tolerance `DistTol = 1e-4`) to set the per-condition feasible flag —
**this needs only function values, not gradients or the solver**, so feasibility
display can ship before the optimizer does.

---

## 4. The numeric core (the hard, valuable part)

- **ALM** (`tmNLCO_alm.cpp`, Lang's Augmented-Lagrangian + BFGS inner loop with
  cubic-backtracking line search) is the **default and only compiled** backend.
  Self-contained: STL + `tmMatrix` only. **Fully distributable.**
- **CFSQP / RFSQP**: adapters exist but the solver sources are **absent** from
  the repo and are **proprietary/non-redistributable** → cannot and will not be
  shipped.
- **wnlib**: full source present, **public domain**, *not* compiled by default.
  Optional second backend; skip for v1.
- **Constraint functions** (`tmConstraintFns.{h,cpp}`, ~25 `tmDifferentiableFn`
  classes) provide **analytic gradients** for every objective/constraint — no
  finite differencing. Solver-agnostic by design.

**Cost:** doubly-iterative (outer penalty ≤50 × inner BFGS ≤200 × line search),
each step evaluating up to **O(n²)** leaf-pair constraints, with O(n²) BFGS
storage. Non-convex / multi-modal (many local optima — why robust ALM was chosen
over faster CFSQP). This is the part where interpreted JS would be materially
slower and a **WebAssembly** compile pays off.

Golden reference (from `test/tmModelTester`, ALM): file_1 scale → `0.517637`,
file_5 stiffness-weighted RMS strain → `3.58%` (full table in
`tmModelTester.out.txt`). These are exact regression anchors for the port.

---

## 5. File format (`.tm` / `.tmd5`)

Flat, newline-delimited ASCII; **positional** (no keys), one token per line.
Pointers are stored as the target's 1-based index. Versions 3.0 / 4.0 / 5.0
dispatched on a version string; **v5** is full-fidelity (incl. polys/creases/
facets), **v4** is nodes/edges/paths/conditions only. (Note: the bundled
`*.tmd5` samples are actually *v4.0* files.) Two-pass read: create N blank parts,
then fill & resolve indices. A class-tag→constructor registry handles
polymorphic conditions; an unknown condition is skipped via its `numLines` count
(forward-compatible).

**Port stance (DECIDED):** the **native format is JSON**, designed for
debuggability and ease for the port's own internals — it is the source of truth
for save/load and for undo snapshots, and its schema mirrors the TS model
directly (IDs instead of dpptr pointers). The original **v3/v4/v5 ASCII format is
legacy**: supported as **import + export** only (interop with desktop TreeMaker
on demand), implemented as an isolated serializer module.

The legacy reader reimplements the positional ASCII parse in TS (a cursor over
`split(/\r\n|\r|\n/)`). Gotchas to match: `std::fixed` precision on export
(v5=10, v4=6 fractional digits via `toFixed`); booleans are the words
`true`/`false`; empty strings are a blank line (needs 2-char lookahead); legacy
`NAN(017)` → `0.0`; no checksums (one field-count slip cascades — copy field
order verbatim from each `Getv5Self`). Tested with the bundled `.tmd5` oracles:
*load legacy → model → export legacy → diff*, and *load legacy → save JSON →
load JSON* idempotence.

---

## 6. GUI architecture & the UI/back-end boundary

wxWidgets doc/view, SDI. One design window (`tmwxDesignCanvas`, ~3k LOC,
immediate-mode renderer) + three floating palettes (Inspector, View Settings,
Folded Form) + optimizer progress modal.

- **Canvas** (`tmwxDesignCanvas::OnDraw`): three passes (fills → lines → text)
  over each part type, gated by ~100 View-Settings toggles; `TreeToDC/DCToTree`
  transforms (Y flipped, 72 px/inch). Already a full-repaint, immediate-mode
  renderer → maps directly to **Canvas2D**. Color constants and draw order are
  reusable nearly verbatim. **The port renders this surface as pure SVG/DOM**
  (decided), not Canvas — reusing the original's draw order, color constants, and
  hit-test priority while gaining DOM-native hit-testing, CSS styling, and
  inspectability. Dense crease patterns (thousands of creases/facets) are a known
  perf watch-item for P3; if SVG proves heavy there, that single view can fall
  back to Canvas2D without affecting the rest.
- **Interaction** (`OnMouse/OnKeyDown`): click-empty adds a node (root, or child
  of the single selected node); click/shift-click selects; drag moves nodes;
  Delete kills selection; right-click = Edit menu. Hit-test priority: points →
  lines → areas, within `CLICK_DIST = 4px`.
- **Commands** (menus, handlers on `tmwxDoc`): File, Edit (select/nodes/edges/
  absorb/split/strain/stub), View (modes + fit + paper size), **Action**
  (Scale Everything ⌘1, Scale Selection ⌘2, Minimize Strain ⌘3, Build Crease
  Pattern ⌘4, Kill CP), Condition (add/remove each type).
- **Inspector**: per-selection-type property form (Tree / Node / Edge / Path /
  Poly / … / Condition panels), validated edits applied immediately.
- **Undo/redo**: snapshot-based — each command serializes the **entire tree** to
  a string for before/after. Coarse but robust; reuse directly.
- **Coupling**: tight & synchronous — the canvas/inspector read & write
  `tmTree`/`tmPart` directly; selection is a model-side `tmCluster`.

**The clean seam** (what the model must expose to any UI):
1. enumerate parts with per-part geometry + flags (for rendering),
2. hit-test / selection,
3. typed property get/set (inspector),
4. menu-command operations,
5. serialize/deserialize (save + undo snapshots).

---

## 7. Testing strategy

The original ships ready-made oracles — we exploit them at every layer.

1. **Golden numeric regression (model):** run the ported engine on
   `test/tmModelTester/tmModelTester_{1..5}.tmd5` and assert scale / RMS-strain /
   feasibility against `tmModelTester.out.txt`. Also keep the *native* tester
   buildable under `Orig/` to generate fresh oracles for any input.
2. **File round-trip:** load each sample `.tmd5`, re-serialize, and diff (modulo
   documented float-precision rules). Property: load→save→load is idempotent.
3. **Differential testing:** for new trees, compare ported output vs. the native
   binary (or, if Wasm, vs. a debug native build) — node positions, scale, crease
   set — within tolerance (`DistTol = 1e-4`).
4. **Unit tests (TS):** `tmArray` set ops, path-length calc, convex hull,
   condition `Func`/feasibility, the I/O reader/writer.
5. **End-to-end (Playwright):** load a file → render → assert canvas/SVG
   contains expected parts; add-node-by-click; drag-move; run Scale Everything →
   assert reported scale; Build Crease Pattern → assert crease count; save →
   re-open.
6. **Manual checkpoints:** visual diff of rendered crease patterns vs. the
   desktop app screenshots in `Orig/Source/help/` for a handful of canonical
   designs (bird base, etc.).

Per `PLAN.md`, tests exist to *de-risk* misunderstanding so we can roll back a
"conception" and try another. `HISTORY.md` is updated each session for
stop/restart without context.

---

## 8. Recommended architecture (proposal)

A **hybrid** (decided): compile the numerically-sensitive C++ to WebAssembly,
reimplement the data/UI layer in TypeScript. The **Wasm boundary = solver +
geometry**: ALM optimizer, cleanup pipeline, molecule/crease construction, and
facet ordering all run in Wasm (bit-identical to desktop); TS owns the data
model, conditions, JSON + legacy I/O, selection, undo, and the **pure-SVG** UI.

```
┌─────────────────────────────────────────────────────────────┐
│ Browser (TypeScript)                                          │
│                                                              │
│  UI: pure SVG/DOM design surface + reactive chrome           │
│      (menus, Inspector forms, View-Settings toggles, dialogs)│
│        │  render from model ▲    │ commands / property edits  │
│        ▼                    │    ▼                            │
│  Controller / selection (port of tmwxDoc + tmCluster select) │
│        │                                                      │
│  Model (TS): tmTree graph, conditions, JSON + legacy I/O, undo│
│   - IDs instead of dpptr; explicit beginEdit/endEdit          │
│        │  state vectors in / results (positions, creases) out │
│        ▼                                                      │
│  ┌───────────────── Web Worker ───────────────────────────┐  │
│  │ Wasm engine (Emscripten-compiled C++ from tmModel):     │  │
│  │   ALM + tmConstraintFns + tm*Optimizer        (P2)      │  │
│  │   + cleanup pipeline + molecule build + facet order (P3)│  │
│  │   progress/cancel via postMessage (tmNLCOUpdater)       │  │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

P1 (viewer/editor) runs entirely in the TS layer — **no Wasm yet**; the worker is
introduced at P2.

**Why hybrid (vs. all-TS or all-Wasm):**

- The packing solver, molecule builder, and facet ordering are large,
  numerically delicate, and already correct. Compiling them guarantees
  **bit-identical output** and good performance, and is far less work than
  re-deriving the augmented-Lagrangian + insetting math in TS.
- The data model, conditions, I/O, selection, and UI benefit from being **native
  TS** — debuggable and maintainable *by Claude* (a `PLAN.md` priority), and they
  carry the dpptr/RAII idioms that *should be redesigned away*, not transpiled.
- The Web Worker keeps long solves off the UI thread; `tmNLCOUpdater` already
  abstracts progress/cancel.

**Exact Wasm boundary (decided — solver + geometry):** compile `tmNLCO` +
`tmNLCO_alm` + `tmConstraintFns` + `tm{Scale,Edge,Strain}Optimizer` (P2), plus
`tmNewtonRaphson` + `tmStubFinder` + the geometry of `CleanupAfterEdit` /
`BuildPolysAndCreasePattern` / `tmTree_FacetOrder` (P3). TS keeps the editable
data model, conditions, I/O, selection, undo, and UI. The TS↔Wasm contract is a
small message protocol over the worker: send tree state (nodes/edges/conditions/
paper), receive results (scale, node positions, strains; then vertices/creases/
facets with kinds, folds, and layer order) — never raw pointers.

**Phasing (proposed):**
- **P0 — Skeleton & oracles:** repo/build/test scaffolding; native `tmModelTester`
  kept buildable to emit golden outputs; Playwright harness.
- **P1 — Viewer/editor (no solver):** TS model + `.tmd5` load/save + Canvas2D
  render + tree editing (add/move/delete nodes, conditions) + Inspector + View
  Settings + undo. Feasibility display (no gradients). Ships something usable.
- **P2 — Packing:** Wasm ALM + optimizers wired to Scale/Edge/Strain commands;
  golden numeric regression green.
- **P3 — Crease pattern:** Wasm cleanup + molecule build + facet order; Build
  Crease Pattern command; crease/facet rendering; folded-form view.
- **P4 — Polish:** export (SVG/PNG/PDF), docs, remaining conditions, edge cases.

---

## 9. Decisions & remaining confirmations

**Decided:**
1. **Engine strategy** — Hybrid: **solver + geometry in Wasm** (ALM, cleanup,
   molecule build, facet order), TS model/conditions/I-O/UI/undo. (§8)
2. **v1 scope** — **Phased MVP**, viewer/editor (P1) first, then P2–P4. (§8)
3. **Rendering** — **Pure SVG/DOM** design surface (Canvas2D fallback reserved for
   the dense crease-pattern view only if needed). (§6, §8)
4. **File format** — native **JSON**; legacy v3/v4/v5 ASCII = **import + export**
   only, isolated serializer. (§5)

**Still to confirm (not blocking P0/P1 scaffolding; can default):**
5. **Chrome framework** — for menus/Inspector/View-Settings forms: a light
   reactive framework vs. vanilla TS. *Default if unspecified:* a small, typed,
   low-magic stack (Vite + TypeScript; lightweight component lib or vanilla),
   favoring Claude-maintainability over ecosystem size.
6. **Toolchain** — Emscripten availability for the P2 Wasm build (not needed for
   P1). *Default:* Vite + TypeScript + Vitest + Playwright now; introduce
   Emscripten at P2. Target modern evergreen browsers only.
7. **Feature cuts (confirm OK to defer):** native printing, bundled HTML help,
   clipboard/metafile copy, debug/log frame, platform-specific dialog plumbing,
   MDI. (§6 already lists these as cut/deferred.)

---

## 10. References

- Original article: https://langorigami.com/article/treemaker/
- Upstream source: https://github.com/bugfolder/treemaker (vendored in `Orig/`)
- Native headless tester (API + oracles): `Orig/Source/test/tmModelTester/`
- Build notes & symbols: `Orig/README.txt`
