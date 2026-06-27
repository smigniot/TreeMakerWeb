# TreeMakerWeb

A browser port of **[TreeMaker 5](https://langorigami.com/article/treemaker/)**,
Robert J. Lang's software for designing origami **crease patterns** from a stick
figure of the subject, using the *circle/river packing* algorithm.

TreeMakerWeb runs **entirely in your browser** — there is no server or backend.
The original TreeMaker mathematical engine (the augmented‑Lagrangian optimizer,
the molecule/crease‑pattern builder, and facet ordering) is the real C++ code,
compiled to **WebAssembly** and run in a Web Worker; the UI, editing, file I/O,
and rendering are TypeScript.

## What you can do

- **Draw a tree** — click to add nodes, drag to move, Delete to remove. The tree
  is the stick figure of your subject; each edge becomes a flap.
- **Add conditions** — **select a node or edge** (or 2–3 nodes / 2 edges) and the
  buttons appear in the Inspector (right panel): stick a node to the paper
  edge/corner/symmetry line, fix its position, pair/make‑collinear nodes, fix or
  quantize path angles, fix edge lengths, equalize strains. Conditions show as
  markers on the canvas and are listed (with remove ✕) in the Tree panel.
- **Pack** — *Scale Everything* (circle/river packing — maximize the model size),
  *Minimize Strain*.
- **Build the crease pattern** — full molecule generation with mountain/valley
  assignment, rendered as an overlay.
- **Folded‑form preview** — a 2D silhouette of the folded base.
- **Open / save** — open desktop TreeMaker **`.tmd5`** files (v4 and v5); save as
  native **JSON**, or **export `.tmd5`** that desktop TreeMaker can open.
- **Export the crease pattern** — **SVG** (vector editors) or **`.fold`** (the
  standard origami format, e.g. for Origami Simulator).

## Quick start (development)

Requires [Node.js](https://nodejs.org/) 18+.

```bash
npm install
npm run dev          # http://localhost:5173
```

That's it — the compiled WebAssembly engine is committed, so you do **not** need
a C++ toolchain to run or build the app.

Other scripts:

```bash
npm run build        # type-check + production build → dist/
npm run preview      # serve the production build locally
npm test             # unit/integration tests (Vitest)
npm run test:e2e     # end-to-end tests (Playwright, needs: npx playwright install)
npm run typecheck    # TypeScript, no emit
```

## Running in production (recommended)

TreeMakerWeb is a **static site**. Build it once and serve the `dist/` folder
from any plain HTTP server — there is **no backend and no special configuration
required**.

```bash
npm run build        # produces dist/
```

Then serve `dist/` however you like, for example:

```bash
npx serve dist               # quick local check
# or copy dist/ to nginx / Apache / Caddy / S3 / GitHub Pages …
```

**Why it's frictionless:**

- **No special headers.** The engine is single‑threaded WebAssembly with a normal
  Web Worker (no `SharedArrayBuffer`/threads), so it does **not** require
  cross‑origin isolation (`COOP`/`COEP`) — unlike many Wasm apps.
- **Works at any path.** The build uses relative asset URLs, so `dist/` works
  served from a domain root **or** a subfolder (e.g. GitHub Pages at
  `https://user.github.io/repo/`) with no config changes.
- **`.wasm` MIME.** Most servers already serve `application/wasm`; if yours
  doesn't, the loader transparently falls back to a non‑streaming fetch (you may
  see a console warning, but it still works). For best performance, configure
  `application/wasm` for `.wasm` files.

### GitHub Pages

This repo deploys to Pages automatically via
[`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml) on
every push to `main`. The relative base means no extra configuration is needed
even though Pages serves under `/<repo>/`. See **[DEPLOY.md](DEPLOY.md)** for the
one-time setup and a verification checklist.

Live site: <https://smigniot.github.io/TreeMakerWeb/>

(`dist/` is also committed, so you can serve the build directly without a build
step on any static host.)

## Rebuilding the WebAssembly engine (optional)

You only need this if you change the C++ in `src/wasm/tmwasm.cpp` or the vendored
model under `Orig/`. It requires the [Emscripten SDK](https://emscripten.org/):

```bash
source ~/emsdk/emsdk_env.sh
bash tools/wasm/build.sh         # → src/wasm/generated/tmengine.{js,wasm}
```

The native model can also be built and run for golden‑value regression
(`npm run oracle`, requires `clang++`).

## Project layout

```
src/
  model/   TypeScript data model (tree, paths, conditions) — no Wasm
  io/      JSON + legacy .tmd5 (v4/v5) import; SVG / FOLD / v5 export
  view/    pure-SVG design surface, folded-form view
  ui/      inspector, view settings, undo, file & optimizer commands
  wasm/    C wrapper (tmwasm.cpp), build output, engine + Web Worker client
Orig/      vendored TreeMaker 5 C++ source (reference + compiled to Wasm)
tools/     wasm build, native oracle / sanitizer harnesses
docs/      DESIGN.md companion: long-form subsystem analyses
```

See **[DESIGN.md](DESIGN.md)** for the architecture and **[HISTORY.md](HISTORY.md)**
for the running development log.

## Credits & license

- Original **TreeMaker** © Robert J. Lang — <https://langorigami.com>.
- Upstream source vendored under `Orig/` (see `Orig/PROVENANCE.md`),
  from <https://github.com/bugfolder/treemaker>.

TreeMaker is released under the **GNU General Public License v2**. Because
TreeMakerWeb incorporates and compiles that code, it is likewise distributed
under the **GPL v2** (see `Orig/LICENSE.txt`).
