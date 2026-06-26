# TreeMakerWeb — History

Running log so work can stop/restart without prior context (per `PLAN.md`).
Newest entry first.

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
