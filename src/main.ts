// TreeMakerWeb entry point — assembles the P1 viewer/editor: SVG design surface,
// inspector, view-settings panel, snapshot undo/redo, and file open/save.

import './styles.css';
import { Tree } from './model/tree';
import { pt } from './model/geometry';
import { DesignView } from './view/designView';
import { UndoManager } from './ui/undo';
import { Inspector } from './ui/inspector';
import { ViewSettingsPanel } from './ui/viewSettingsPanel';
import { openFileDialog, saveJson, downloadText } from './ui/files';
import { creasePatternToSvg } from './io/svgExport';
import { optimizeTree, OptimizeMode } from './ui/optimize';
import { buildTreeCreasePattern, cpStatusMessage } from './ui/creasePattern';
import { exportTreeV5 } from './ui/legacyExport';
import { FoldedFormView } from './view/foldedFormView';

export interface App {
  tree: Tree;
  view: DesignView;
  undo: UndoManager;
}

export function mount(root: HTMLElement): App {
  root.replaceChildren();
  const toolbar = el('div', 'tm-toolbar');
  const host = el('div', 'tm-canvas-host');
  const sidebar = el('div', 'tm-sidebar');
  const status = el('div', 'tm-statusbar');
  const inspectorHost = el('div', 'tm-inspector');
  const viewHost = el('div', 'tm-viewsettings');
  const foldedPanel = el('div', 'tm-folded-panel');
  const foldedTitle = el('div', 'tm-panel-title');
  foldedTitle.textContent = 'Folded form';
  const foldedHost = el('div', 'tm-folded-host');
  foldedPanel.append(foldedTitle, foldedHost);
  sidebar.append(inspectorHost, viewHost, foldedPanel);
  root.append(toolbar, host, sidebar, status);

  const tree = new Tree();
  const undo = new UndoManager(tree);
  const view = new DesignView(host, tree, { onEdit: (label) => undo.record(label) });
  new Inspector(inspectorHost, tree, view.selection, (label) => undo.record(label));
  new ViewSettingsPanel(viewHost, view);
  const folded = new FoldedFormView(foldedHost);

  // --- toolbar ---
  const undoBtn = button('Undo', () => undo.undo());
  const redoBtn = button('Redo', () => undo.redo());
  const refreshUndo = () => {
    undoBtn.disabled = !undo.canUndo;
    redoBtn.disabled = !undo.canRedo;
    undoBtn.title = undo.undoLabel ? `Undo ${undo.undoLabel}` : 'Undo';
    redoBtn.title = undo.redoLabel ? `Redo ${undo.redoLabel}` : 'Redo';
  };
  undo.onChange(refreshUndo);

  const reload = () => { view.selection.clear(); view.refit(); view.render(); undo.reset(); refreshUndo(); };
  const newBtn = button('New', () => { tree.loadState(new Tree().toState()); reload(); });
  const openBtn = button('Open…', async () => {
    const loaded = await openFileDialog();
    if (loaded) { tree.loadState(loaded.toState()); reload(); }
  });
  const saveBtn = button('Save', () => saveJson(tree));
  const exportTmBtn = button('Export .tmd5', async () => {
    if (tree.nodes.size === 0) { status.textContent = 'Nothing to export.'; return; }
    exportTmBtn.disabled = true;
    status.textContent = 'Exporting TreeMaker 5 file…';
    try {
      downloadText(await exportTreeV5(tree), 'design.tmd5', 'text/plain');
      status.textContent = 'Exported design.tmd5 (opens in desktop TreeMaker 5).';
    } catch (err) {
      status.textContent = `Export failed: ${(err as Error).message}`;
    } finally {
      exportTmBtn.disabled = false;
    }
  });
  const sampleBtn = button('Sample', () => { loadSample(tree); reload(); });

  // --- optimizer commands ---
  const optimizeButtons: HTMLButtonElement[] = [];
  const runOptimize = async (label: string, mode: OptimizeMode) => {
    optimizeButtons.forEach((b) => (b.disabled = true));
    status.textContent = `${label}…`;
    try {
      const res = await optimizeTree(tree, mode);
      undo.record(label);
      refreshUndo();
      if (!res.feasible) status.textContent = `${label}: result is INFEASIBLE`;
    } catch (err) {
      status.textContent = `${label} failed: ${(err as Error).message}`;
    } finally {
      optimizeButtons.forEach((b) => (b.disabled = false));
    }
  };
  const scaleBtn = button('Scale Everything', () => void runOptimize('Scale', OptimizeMode.Scale));
  const strainBtn = button('Minimize Strain', () => void runOptimize('Minimize strain', OptimizeMode.Strain));
  optimizeButtons.push(scaleBtn, strainBtn);

  // --- crease pattern ---
  const buildBtn = button('Build Crease Pattern', async () => {
    optimizeButtons.forEach((b) => (b.disabled = true));
    buildBtn.disabled = true;
    status.textContent = 'Building crease pattern…';
    try {
      const cp = await buildTreeCreasePattern(tree);
      if (!cp.ok) { status.textContent = `Build failed: ${cp.error ?? 'unknown'}`; return; }
      // Apply the optimized packing (scale + node positions, spec order) so the
      // tree matches the crease pattern; one undoable edit.
      tree.edit(() => {
        if (cp.scale) tree.setScale(cp.scale);
        const nodes = tree.nodeList();
        for (const rn of cp.nodes ?? []) { const n = nodes[rn.i]; if (n) tree.moveNode(n.id, { x: rn.x, y: rn.y }); }
      });
      undo.record('Build crease pattern');
      refreshUndo();
      view.setCreasePattern(cp);
      folded.setCreasePattern(cp);
      status.textContent = `Crease pattern: ${cpStatusMessage(cp.status)} · ${cp.creases.length} creases, ${cp.facets.length} facets`;
    } catch (err) {
      status.textContent = `Build failed: ${(err as Error).message}`;
    } finally {
      optimizeButtons.forEach((b) => (b.disabled = false));
      buildBtn.disabled = false;
    }
  });
  const killBtn = button('Kill CP', () => { view.setCreasePattern(null); folded.setCreasePattern(null); });
  const exportSvgBtn = button('Export SVG', () => {
    if (!view.creasePattern) { status.textContent = 'Build the crease pattern first, then Export SVG.'; return; }
    downloadText(creasePatternToSvg(view.creasePattern, tree.paper), 'crease-pattern.svg', 'image/svg+xml');
  });

  toolbar.append(strong('TreeMakerWeb'), newBtn, openBtn, saveBtn, exportTmBtn, sampleBtn,
    sep(), undoBtn, redoBtn,
    sep(), scaleBtn, strainBtn,
    sep(), buildBtn, killBtn, exportSvgBtn,
    hint('click empty: add node · drag: move · Delete: remove'));

  // --- status bar ---
  const updateStatus = () => {
    status.textContent =
      `${tree.nodes.size} nodes · ${tree.edges.size} edges · ${tree.pathList().length} leaf paths · ` +
      `${tree.conditionList().length} conditions · ${tree.isFeasible ? 'feasible' : 'INFEASIBLE'}`;
  };
  tree.onChange(updateStatus);
  // A crease pattern is stale once the tree changes; the Build command re-sets it
  // after its own edit, so it survives.
  tree.onChange(() => { if (view.creasePattern) { view.setCreasePattern(null); folded.setCreasePattern(null); } });
  updateStatus();
  refreshUndo();

  // --- keyboard shortcuts ---
  window.addEventListener('keydown', (e) => {
    const mod = e.metaKey || e.ctrlKey;
    if (!mod) return;
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo.undo(); }
    else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); undo.redo(); }
    else if (k === 's') { e.preventDefault(); saveJson(tree); }
    else if (k === 'o') { e.preventDefault(); void openBtn.click(); }
  });

  return { tree, view, undo };
}

function loadSample(tree: Tree): void {
  tree.loadState(new Tree().toState());
  tree.edit(() => {
    const c = tree.addNode(pt(0.5, 0.5));
    tree.addNodeFrom(c.id, pt(0.15, 0.85));
    tree.addNodeFrom(c.id, pt(0.85, 0.85));
    tree.addNodeFrom(c.id, pt(0.15, 0.15));
    tree.addNodeFrom(c.id, pt(0.85, 0.15));
  });
}

function el(tag: string, className: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = className;
  return e;
}
function button(label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}
function strong(text: string): HTMLElement {
  const s = document.createElement('strong');
  s.textContent = text;
  s.style.marginRight = '8px';
  return s;
}
function sep(): HTMLElement {
  const s = document.createElement('span');
  s.style.cssText = 'width:1px;height:18px;background:#ccc;margin:0 4px';
  return s;
}
function hint(text: string): HTMLElement {
  const s = document.createElement('span');
  s.textContent = text;
  s.style.cssText = 'margin-left:auto;color:#777;font-size:12px';
  return s;
}

const appRoot = document.getElementById('app');
if (appRoot) mount(appRoot);
