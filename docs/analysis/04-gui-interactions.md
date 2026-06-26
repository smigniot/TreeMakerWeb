# TreeMaker 5 GUI — Browser Port Analysis

Source: `Source/tmwxGUI/` (~21K LOC, wxWidgets). Isolates the UI/graphical-interaction layer to inform the HTML/SVG reimplementation.

## 1. Application Structure

**Framework:** wxWidgets document/view (`wxDocument`/`wxView`/`wxDocManager`), SDI by default (`tmwxDocChildFrame` = `wxDocChildFrame`; an experimental `TM_USE_MDI` switch exists in `tmwxDesignFrame.h`).

**Core objects:**
- `tmwxApp` (`tmwxCommon/tmwxApp.cpp`) — `OnInit()` builds the doc manager, calls `tmPart::InitTypes()` (model type registry, required before the inspector can build dispatch tables), creates the menu bar (`MakeMenuBar`, ~line 580), instantiates the three palettes.
- `tmwxDoc` (`tmwxDocView/tmwxDoc.*`) — owns `tmTree* mTree`, the selection (`tmCluster mSelection`), and `std::stringstream mCleanState`. Hosts virtually every menu command handler.
- `tmwxView` (`tmwxView.*`) — thin coordinator; `OnDraw` delegates to the canvas; `OnUpdate` triggers redraws.
- `tmwxDesignFrame` (`tmwxDesignFrame.*`) — the document window; contains a single `tmwxDesignCanvas`.
- `tmwxDesignCanvas` (`tmwxDesignCanvas.*`, ~3000 LOC) — scrolling drawing surface; all rendering + mouse/keyboard interaction.

**Screen layout** — one document window plus three independent floating "palette" top-level windows (created in `tmwxApp::OnInit` lines 374-396, kept in globals `gInspectorFrame`, `gFoldedFormFrame`, `gViewSettingsFrame`):
- **Design window** = menu bar + `tmwxDesignCanvas` (paper drawn with borders LEFT=15/TOP=35/RIGHT=52/BOTTOM=29 px, 72 px/inch).
- **Inspector palette** — context-sensitive property editor for the selection.
- **View Settings palette** — ~100 display toggles + preset view buttons.
- **Folded Form palette** — 2D folded-base diagram (elevation vs. depth).
- **Log frame** (debug builds only, `TM_USE_LOGFRAME`).

`tmwxApp::SetPalettes()` (~line 1060) re-points all palettes at the active document on activation.

## 2. The Drawing Canvas (`tmwxDesignCanvas.cpp`)

**Paint entry:** `OnDraw(wxDC&)` (line 2381). Same routine serves screen, print preview, printer (the `mPrinting` flag changes scaling + adds a header). Dragging uses a `wxBufferedDC` (line 2916).

**Coordinate transforms** (lines 403-455): `TreeToDC`/`DCToTree` map model (paper-inch) coords to device pixels. **Y axis is flipped** (`paperHeight - y`). `mPaperSizeScreen` = paperSize × 72; printing scales via `mDCScale`.

**Render pipeline** — three passes (Fill, Lines, Text) over each part type, dispatched generically by `DrawAllParts<S,P>` → `DrawPart<S,P>` (template-specialized per type) → `IsVisible<P>` gate (lines 2425-2453). Draw order:
1. Paper fill, then poly + facet fills.
2. Paper lines (square outline + symmetry line), then poly, path, edge, node (node "circles" clipped to paper), facet, crease, condition lines.
3. Text labels for every type, then the printed header.

**What gets drawn** (each with its own color constant, lines 46-75):
- **Nodes** — dot + optional circle (leaf-node circle radius = first edge's strained length × scale), index, (x,y), elevation, depth, flags (LSBQPC), label.
- **Edges** — line + dot, index, length with strain % annotation, flags, label; pinned edges use a distinct color.
- **Paths** — line + dot, length (`act ≥ min`), flags; color encodes state (internal/infeasible-red/active-green/valid-amber via `GetBasePartColor<tmPath>`).
- **Polys** — fill, outline, control dot, index.
- **Vertices, Creases** — creases colored by kind (axial/gusset/ridge/hinge/pseudohinge) and fold (mountain/valley dashes).
- **Facets** — fill (colored by orientation), order arrows.
- **Conditions** — drawn as offset "flags" (dot + connector line + type text) attached to their owning part; each type uses a distinct fixed offset angle (constants lines 95-100) so multiple conditions on one node don't overlap. Dispatch via per-type `CalcLoc`/`DrawConditionText`/`DrawConditionLines` function-pointer tables keyed by `tmPart::GetTag()`.

Already an immediate-mode, full-repaint renderer → maps cleanly to Canvas2D or retained SVG.

## 3. User Interactions / Editing

**Direct manipulation** — `OnMouse` (line 2737), `OnKeyDown` (2984), `OnContextMenu` (2719). Hit-testing via `ClickOn<P>` (point hit = within `CLICK_DIST`=4 px; line hit = perpendicular distance) with priority: points (node/condition/vertex) → lines (edge/path/crease) → areas (facet/poly).

| User action | Effect |
|---|---|
| Click empty canvas, tree empty | `tmTree::AddNode(0,…)` creates root node; submits "Add Node" |
| Click empty, exactly one non-sub node selected | `AddNode(selNode,…)` adds a child node + edge ("Add Node") |
| Alt/Ctrl-click empty (modified) | Adds node without selecting it → fan out multiple edges from one node |
| Click empty, nothing/ambiguous selected | Clears selection |
| Click a part | `ExtendSelection` → selects it (sets the inspector) |
| Shift-click a part | Toggle add/remove from selection |
| Drag selected node(s)/edge endpoints | Live preview via `CalcLoc` offset; on release `tmTree::SetNodeLocs(...)` ("Drag"); positions clamped to paper; pinned nodes don't move unless modifier held |
| Drag near window edge | Auto-scrolls canvas |
| Tab/Esc/Enter | Clear selection |
| Delete/Backspace | `DoKillSelection()` |
| Right-click | Pops up the Edit menu as a context menu |
| (`TM_WITH_RANGE_SELECTION`, compiled out) | Rubber-band rectangle selection |

**Command set (menus)** — handlers on `tmwxDoc`, split across `tmwxDoc_Edit.cpp`, `tmwxDoc_Action.cpp`, `tmwxDoc_Condition.cpp`, `tmwxDoc_File.cpp`; IDs in `tmwxApp.h`; event table in `tmwxDoc.cpp` (2 entries per command: `EVT_MENU` + `EVT_UPDATE_UI`).

- **File:** New/Open/Close/Save/Save As/Revert, Print/Print Setup/Print Preview, Preferences, Export v4 (debug), Exit.
- **Edit:** Undo/Redo, Cut/Copy(metafile, off on GTK)/Paste(disabled)/Clear; **Select** (All/None/By Index/Movable Parts/Path from Nodes/Corridor Facets); **Nodes** (Make Root, Perturb Selected/All); **Edges** (Set/Scale Lengths, Renormalize to Edge / to Unit Scale); **Absorb** (Selected Nodes/Redundant Nodes/Selected Edges); **Split** edge; **Strain** (Remove/Relieve, Selection/All); **Stub** (Pick for Nodes/Poly, Add Largest, Triangulate Tree).
- **View:** toggle Inspector (⌘I) / View Settings (⌘G) / Folded Form (⌘F); view modes Design/Tree/Creases/Plan (checkable, mutually exclusive); Fit to Screen/Width/Height; Set Paper Size.
- **Action (the optimizers):** Scale Everything (⌘1, `tmScaleOptimizer`), Scale Selection (⌘2, `tmEdgeOptimizer`), Minimize Strain (⌘3, `tmStrainOptimizer`), Build Crease Pattern (⌘4, `tmTree::BuildPolysAndCreasePattern`), Kill Crease Pattern.
- **Condition:** node (fixed to symmetry line / paper edge / corner / position; paired; collinear), edge (length fixed; same strain), path (active; angle fixed; angle quantized), plus Remove-by-category and Remove All.

**Undo/redo:** snapshot-based. `tmwxDoc::SubmitCommand(name)` (line 112) wraps a `tmwxCommand` (`tmwxCommand.*`, subclass of `wxCommand`) onto the `wxCommandProcessor`. Each command serializes the **entire** tree (`tmTree::PutSelf`/`GetSelf` to a `stringstream`) for before/after states; Undo/Redo deserialize the whole tree and call `Modify()`+`UpdateAllViews()`. Simple, robust, coarse.

## 4. Inspector / Dialogs

**Inspector** (`tmwxInspectorFrame.cpp`) — floating palette that swaps in a type-specific panel based on the selection (`DispatchSetSelection`, line 86): 0 selected → Tree panel; 1 → that object's panel; ≥2 → Group (counts) panel. Dispatch uses a `tmPart::GetTag()`-indexed function-pointer table (`PanelTraits<P>`).

Editable panels and fields:
- **TreePanel:** paper width/height, scale, symmetry on/off + center X/Y + angle; condition list. (Checkbox/button changes apply immediately.)
- **NodePanel:** index, locX, locY, label (+ read-only flags, elevation, depth).
- **EdgePanel:** index, length, strain, stiffness, label (validated: length > MIN_EDGE_LENGTH, strain ≥ −1, stiffness > 0).
- **Condition panels** (one per type) edit that constraint's parameters.
- **Read-only panels:** Path, Poly, Vertex, Crease, Facet, Group.

**Edit flow** (`OnApply`): validate each field via `tmwxTextCtrl` validators (call model checks) → diff against current → apply via setters inside a `tmTreeCleaner` RAII scope → `SubmitCommand("Edit …")` → `Fill()` to re-read. Modal input dialogs (`tmwxGetUserInputDialog` + subclasses) back the "…"-suffixed commands.

**View Settings panel** (`tmwxViewSettings*`) — ~100 boolean toggles (full list in `tmwxViewSettings.h`) grouped by object type × attribute (show class, dots, lines, fills, indices, coords, lengths, flags, labels, conditions…), 4-column layout with per-group All/None and 6 preset buttons. Presets are static instances: `sNoneView`, `sDesignView`, `sCreasesView`, `sTreeView`, `sPlanView`, `sAllView`. Settings persist via `wxConfig`. **The canvas reads these flags directly in `IsVisible<P>` and every `DrawPart`** — single source of truth for what renders.

**Optimizer dialog** (`tmwxOptimizerDialog*`) — modal progress dialog (description text, accumulating-dots progress, Cancel) during long NLCO solves. Drives `tmOptimizer::Optimize()` and pumps the event loop; status codes IN_LOOP/NORMAL/USER_CANCELLED/OTHER; supports cancel (Esc/Ctrl-C/Cmd-.) and bad-convergence revert. Split into `_cmn` + per-platform `_mac/_gtk/_msw` files purely for native modal event-loop plumbing.

## 5. Coupling to the Model

**Very tight, synchronous, in-process.** The view reads and writes `tmTree`/`tmPart` objects directly:
- Canvas `IsVisible`/`DrawPart`/`ClickOn` iterate `GetTree()->GetParts<P>()` and read live geometry/flags every frame.
- Inspector panels hold raw `tmNode*`/`tmEdge*`/`tmTree*` and call getters/setters directly; validation defers to model methods.
- Selection is the model-side `tmCluster mSelection` on the document, shared by reference between canvas, doc, and inspector. `IsVisible` even forces selected objects visible.
- Every mutation funnels through `tmTreeCleaner` (RAII notify) + `SubmitCommand` (full-tree serialize) + `UpdateAllViews`. **No observer/event model and no serialization boundary** between UI and model other than save/undo snapshots.

**Boundary for the port** — the clean seam: keep the model authoritative, expose (a) `GetParts<P>()` enumeration with per-part geometry+flags for rendering, (b) a hit-test/selection API, (c) typed property get/set, (d) the menu-command operations, (e) tree serialize/deserialize for undo + save. Maps to either WASM-compiling `tmModel` with a thin JS binding, or a worker backend with a JSON protocol mirroring those five capabilities. The full-tree-snapshot undo and `PutSelf`/`GetSelf` format are directly reusable.

## 6. Port Assessment & Feature-Cut Candidates

**Recommended UI approach** (note: project chose **pure SVG**):
- Canvas2D is the natural fit for the original immediate-mode renderer (reuse `OnDraw` ordering + color constants); SVG/retained DOM is viable and gives free hit-testing/CSS styling but needs restructuring away from the per-frame model. **Decision: pure SVG**, with Canvas2D reserved as a fallback for the dense crease-pattern view (P3) if SVG proves heavy.
- Reactive framework (or vanilla TS) for the chrome — menus, Inspector (dynamic per-type forms), View Settings (toggle grid + presets), modal dialogs.
- Keep model state authoritative; drive the surface from a render snapshot and the inspector from typed property accessors. Selection stays a single shared structure (port `tmCluster`).
- Replace floating native palettes with docked side panels/tabs; native context menu → HTML menu; `wxConfig` → `localStorage`.

**Cut or defer (desktop/native-specific):**
- **Printing** entirely — `tmwxPrintout`, Print/Preview/Setup, the `mPrinting` code paths, header/scale-on-page drawing. (Browser prints the page / PDF/SVG export.)
- **HTML Help system** — `tmwxHtmlHelp*` (`wxHtmlHelpController`, bundled `help/`). Replace with web docs.
- **Log frame** — debug-only; use the browser console.
- **Clipboard** — Copy uses `wxMetafile` (already disabled on GTK), Paste is a no-op; drop or replace with SVG/PNG export.
- **Platform optimizer-dialog variants** — collapse `_mac/_gtk/_msw` into one async (Promise/worker) progress modal.
- **Native splash/About, single-instance check, preferences dialog, MDI experiment, `Export v4`, the Debug menu / make-test-tree commands** — defer.

**Keep / port faithfully:** the draw pipeline + colors, click priority + hit-test math, add-node-by-clicking + drag-to-move, the View Settings toggles + 6 presets, the Inspector per-type forms, the condition system, the optimizer/build-crease-pattern operations, snapshot-based undo + tree serialization.

**Key files for the port:**
- Rendering + interaction: `tmwxDocView/tmwxDesignCanvas.cpp` (+`.h`)
- Commands/handlers: `tmwxDocView/tmwxDoc.{h,cpp}`, `tmwxDoc_{Edit,Action,Condition,File}.cpp`
- Menus/IDs/app: `tmwxCommon/tmwxApp.{h,cpp}`; undo: `tmwxCommon/tmwxCommand.{h,cpp}`
- Display toggles/presets: `tmwxViewSettings/tmwxViewSettings.{h,cpp}` + panel
- Inspector dispatch + panels: `tmwxInspector/tmwxInspectorFrame.cpp`, `tmwx{Node,Edge,Tree,Path,…}Panel.*`, `tmwxCondition*Panel.*`
- Optimizer modal: `tmwxOptimizerDialog/tmwxOptimizerDialog_cmn.cpp`
- Folded form: `tmwxFoldedForm/tmwxFoldedFormFrame.cpp`
