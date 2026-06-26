# TreeMakerWeb — History

Running log so work can stop/restart without prior context (per `PLAN.md`).
Newest entry first.

---

## Session 7 — Folded-form view

**State at end:** a "Folded form" panel in the sidebar previews the folded base
— the crease pattern's facets/creases plotted in (elevation, depth) instead of
paper (x, y), the same projection as the C++ tmwxFoldedFormFrame. Building the CP
populates it (the 4-flap base → a triangular silhouette); Kill CP / tree edits
clear it. 46 unit + 6 e2e green.

- Added `e` (elevation) + `d` (depth) per vertex to the CP serializer
  (`tmVertex::GetElevation/GetDepth`).
- `src/view/foldedFormView.ts`: auto-fitted SVG, facets filled + mountain/valley
  creases; wired into `main.ts` (Build/Kill/tree-change).

**Next:** export (SVG/PDF) of the crease pattern; #20 (Web Worker); #14 (legacy
v5/v3).

---

## Session 6 — Conditions wired into the spec builder

**State at end:** the spec builder now applies the user's conditions, so
constrained designs (symmetry, pinning, paired/collinear nodes, edge/path
constraints) optimize and build correctly — not just unconstrained bases.
46 unit + 6 e2e green.

- `io/spec.ts` emits a conditions section (tag + 0-based node/edge indices +
  params) after the edges, skipping any whose referenced parts are gone.
- `tmwasm.cpp` `applyConditions()` creates each via the same `tmTree` API the
  desktop GUI uses (`SetNodesFixedTo…v4`, `SetPaths…v4`, `GetOrMake*PartCondition`,
  `GetLeafPath`), each in a try block so a bad one is skipped, not fatal. Applied
  after the topology is built and before optimization.
- Test: a `NodeFixed` condition pinning a leaf to (0.5, 0) is respected by the
  optimizer (the returned position matches). Task #24 done.

**Next:** folded-form view; export (SVG/PDF); #20 (Web Worker); #14 (legacy v5/v3).

---

## Session 5 — P3 crease-pattern generation (full pipeline working)

**State at end:** the **complete TreeMaker pipeline runs in the browser** — tree →
pack → crease pattern. Click **Build Crease Pattern** and the 4-flap sample
produces a full CP (16 creases, 8 facets) rendered as mountain (red) / valley
(blue) folds; **Kill CP** clears it; a view toggle shows/hides it. 45 unit + 6
e2e green; typecheck + build clean.

**Engine:** the CP code (`BuildPolysAndCreasePattern`, molecule construction,
facet ordering) was already in the Wasm module; exposed via the wrapper.

**Two real bugs solved on the way (both documented):**
1. **`-fexceptions` → `-fwasm-exceptions`.** The recursive molecule builder
   routed every call through JS `invoke_*` trampolines and overflowed the JS
   stack. Native wasm exceptions fixed it (and shrank the module).
2. **Serialization fidelity.** Feeding the CP builder via a hand-written v4
   export failed: `CleanupAfterEdit` asserts a tree owns exactly C(n,2) paths and
   does NOT rebuild the densely cross-linked derived structure (per-node
   `mLeafPaths`, etc.) on load. Rather than perfectly reproduce that by hand, the
   robust fix is a new **spec builder**: pass only AUTHORITATIVE data (node
   positions + edge topology) as a compact whitespace format (`io/spec.ts`), and
   reconstruct the tree natively in C++ via `AddNode` (`tmSpecBuildCP`), which
   maintains all derived structure correctly. Then optimize + build CP in one
   pass. Verified: a native `cptest` (tools/oracle/cptest.cpp) matches.

**Files:** `src/wasm/tmwasm.cpp` (+`tmSpecBuildCP`, `tmBuildCreasePattern`,
`tmOptimizeAndBuildCP`), `src/io/spec.ts`, `src/ui/creasePattern.ts`, CP render
layer in `designView.ts`, Build/Kill commands in `main.ts`.

**Deferred (tracked):** conditions are not yet applied by the spec builder (#new)
— fine for unconstrained bases; constrained designs (symmetry/pinning) need them
for an exact pack. Plus #20 (Web Worker), #14 (legacy v5/v3).

**Next:** apply conditions in the spec builder; folded-form view; export (SVG/PDF).

---

## Session 4 — Optimizer memory bug FIXED (root cause: Wasm stack size)

**State at end:** the prior P2 "known issue" is resolved. A native ASan+UBSan
build of the tester reported **no** memory error — ruling out a portable
heap/UB bug. The real cause: **Emscripten's 64 KB default Wasm stack**. The ALM
BFGS inverse-Hessian (~67×67 doubles) and state vectors for the 33-node packings
overflow it, corrupting adjacent memory (native's 8 MB stack hides it) — which
explains the layout-dependent nondeterminism, the -O1/-O2 difference, and the
cross-call corruption.

**Fix:** build with `-O2` + `-sSTACK_SIZE=5242880` (5 MB); dropped SAFE_HEAP and
the per-call fresh instance. Now **all 5 golden cases pass deterministically in
one reused module instance**, reproducing the original 2005 values to ~6 digits
(file_2 → 0.074658, file_3 → 0.056381). Diagnostic: `tools/oracle/asan.sh`.

44 unit (no skips) + 5 e2e green. Tasks #15/#16/#19 done; #20 (Web Worker) and
#14 (legacy v5/v3) remain.

**Next session:** P3 — crease-pattern generation.

---

## Session 3 — P2 Wasm optimizer (scale packing working end-to-end)

**State at end:** the headline feature — circle/river packing — runs in the
browser via WebAssembly. Click **Scale Everything** and the tree packs (the
4-flap sample optimizes to scale ≈ 0.5, feasible); **Minimize Strain** wired too.
`npm test` (41 pass, 3 skipped), `npm run test:e2e` (5 pass incl. an in-browser
optimize), `npm run typecheck`, `npm run build` all green.

**Toolchain:** installed Emscripten 6.0.1 at `~/emsdk` (`source
~/emsdk/emsdk_env.sh`).

**P2a/P2b — Wasm engine + golden regression:**
- `tools/wasm/build.sh` compiles tmModel + optimizers + ALM to Wasm (ES6 module
  at `src/wasm/generated/`, committed) with `src/wasm/tmwasm.cpp` exposing
  `tmOptimize(docText, mode)`. Reuses the oracle's modern-clang patches.
- `src/wasm/engine.ts` (fresh module per call) + golden test asserting anchors
  exactly (file_1 scale 0.517637, file_5 strain — 5/5 deterministic).

**P2c/P2d — wired to the app:**
- `src/io/legacy/writeV4.ts` (TS → v4 export; validated: exported tree optimizes
  to the same scale as the original). `src/ui/optimize.ts` runs export → optimize
  → applies scale/positions/strains as one undoable edit. Toolbar commands +
  busy/feasibility status; e2e runs it in a real browser.

**KNOWN ISSUE (tracked, task #19):** the 2005 optimizer has latent
layout-dependent UB (uninitialized read / overflow) that makes the hardest
33-node packings (file_2/3/4) nondeterministic under Wasm. Built `-O1 +
SAFE_HEAP`; those golden cases are skipped; each optimization runs in a fresh
Wasm realm (the app calls it per command). Anchors and typical interactive trees
are stable. Fix needs a native ASan/UBSan pass on tmModelTester.

**Deferred (tracked):** optimizer in a Web Worker (#20, currently main-thread);
legacy v5/v3 import + export (#14).

**Next session:** P3 — crease-pattern generation (compile cleanup/molecule/
facet-order to Wasm; Build Crease Pattern command; render creases/facets). Likely
gated on the #19 memory fix, since CP generation exercises far more of the model.

---

## Session 2 — P0 scaffold + P1 viewer/editor (complete)

**State at end:** a working **browser viewer/editor** (no solver yet). `npm run
dev` to run; `npm test` (37 unit/integration, green) and `npm run test:e2e`
(4 Playwright, green) to verify; `npm run oracle` rebuilds the native golden
baseline. Decisions from Session 1 are implemented as planned.

**P0 — scaffold + oracle harness:**
- Vite + TypeScript (strict) + Vitest (jsdom) + Playwright. Bootable shell.
- `tools/oracle/` builds the native GUI-free ALM tester from `Orig/` and emits
  `oracle.out.txt` + `baseline.json` (the P2 regression baseline). `Orig/` stays
  pristine — fixes applied to a `build/` copy (documented modern-clang patches,
  reusable for the P2 Emscripten build). Finding: simple cases reproduce to ~6
  digits; complex non-convex cases drift across compiler/platform.

**P1 — viewer/editor (pure TS, no Wasm):**
- `src/model/`: ID-based model (no dpptr), Tree with depth-counted edit scopes,
  leaf-path derivation (BFS), feasibility, conditions + function-only feasibility.
- `src/io/`: native **JSON** (source of truth + undo snapshots) + legacy **v4.0**
  `.tmd5` import, verified against the real fixtures (field orders read from the
  C++ source, incl. the edge no-owner-ptr quirk).
- `src/view/`: **pure-SVG** design surface — y-flipped transform, layered render,
  click-to-add / select / drag / delete, data-attribute hit-testing.
- `src/ui/`: snapshot **undo/redo**, context **inspector**, **view-settings**
  panel + presets, file **open** (JSON or legacy) / **save** (JSON).
- `main.ts`: toolbar, status bar, keyboard shortcuts. Visually verified.

**Deferred (tracked):** legacy v5/v3 import + legacy export (task — see below).

**Next session:** P2 — compile the ALM optimizer + constraint fns to Wasm in a
Web Worker; wire Scale/Edge/Strain commands; assert the golden numeric baseline.

---

## Session 1 — Analysis phase (complete)

**State at end:** repo contains `PLAN.md`, `DESIGN.md` (new), `HISTORY.md`
(this file), and `Orig/` (vendored upstream C++ source). No port code yet.
**Design decisions are locked (below); awaiting the user's "go" before any
implementation.**

**Decisions (DESIGN.md §9):**
- Engine = **hybrid**, Wasm boundary = **solver + geometry** (ALM, cleanup,
  molecule build, facet order in Wasm; model/conditions/I-O/UI/undo in TS).
- Scope = **phased MVP**, viewer/editor (P1) first → P2 packing → P3 crease
  pattern → P4 export/polish. **P1 needs no Wasm.**
- Rendering = **pure SVG/DOM** (Canvas2D reserved as fallback for the dense
  crease-pattern view only).
- File format = native **JSON**; legacy v3/v4/v5 ASCII = **import + export** only.
- Still-to-confirm (non-blocking, have defaults): chrome framework, Emscripten
  toolchain (P2), feature cuts. Default stack: Vite + TypeScript + Vitest +
  Playwright.

What was done:
1. Cloned upstream TreeMaker into `Orig/` from `github.com/bugfolder/treemaker`
   (C++/wxWidgets, ~70k LOC: `tmModel` ~49k GUI-free + `tmwxGUI` ~21k). Nested
   `.git` stripped, vendored in-repo; provenance in `Orig/PROVENANCE.md`.
2. Ran four parallel analysis agents over: (a) core data model & algorithms,
   (b) optimizers/solvers/NLCO, (c) file I/O & conditions, (d) GUI &
   interactions. **Long-form reports saved under `docs/analysis/`** (01–04);
   distilled into `DESIGN.md`.
3. Read `test/tmModelTester` directly — confirms the model builds/runs **headless**
   (clean model/GUI seam) and provides **golden oracles** (`tmModelTester.out.txt`,
   five `.tmd5` inputs).

Key findings (see `DESIGN.md` for detail):
- Model layer has **zero GUI/OS deps**; clean seam for the port.
- Numeric core = **ALM** optimizer (Lang's own, distributable, the only compiled
  backend). CFSQP/RFSQP are **proprietary + source-absent** → drop. wnlib is
  public-domain, optional.
- Constraint fns have **analytic gradients**; solver-agnostic.
- `.tm/.tmd5` = flat positional ASCII, index-encoded pointers, versioned (v3/4/5);
  faithfully portable to TS. Bundled `*.tmd5` samples are actually v4.0.
- `tmDpptr*` dangle-proof pointers + RAII `tmTreeCleaner` are C++ idioms to
  **redesign away** (IDs + explicit edit scopes), not transpile.
- GUI canvas is immediate-mode → maps to **Canvas2D**; undo is full-tree snapshot
  (reusable); ~100 view-settings toggles drive rendering.
- **Proposed architecture:** hybrid — Wasm for numeric/geometry core in a Web
  Worker, TS for data model + I/O + UI. Phased P0–P4 plan in `DESIGN.md` §8.

Golden anchors to keep green: file_1 scale `0.517637`; file_5 RMS strain `3.58%`.

**Next session:** on "go", start **P0** — scaffold the project (Vite + TS +
Vitest + Playwright), keep the native `tmModelTester` buildable to emit golden
oracles, then **P1** (TS model + JSON/legacy I/O + SVG render + tree editing +
Inspector + undo). Confirm the §9 remaining items (chrome framework, feature
cuts) at kickoff.
