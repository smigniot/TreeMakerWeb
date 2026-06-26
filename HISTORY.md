# TreeMakerWeb — History

Running log so work can stop/restart without prior context (per `PLAN.md`).
Newest entry first.

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
   (C++/wxWidgets, ~70k LOC: `tmModel` ~49k GUI-free + `tmwxGUI` ~21k).
2. Ran four parallel analysis agents over: (a) core data model & algorithms,
   (b) optimizers/solvers/NLCO, (c) file I/O & conditions, (d) GUI &
   interactions. Reconciled findings into `DESIGN.md`.
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
