// TreeMakerWeb entry point. Builds the app shell and mounts the SVG design
// surface. The full chrome (inspector, view-settings panel, menus, undo) is
// layered on in the chrome task; this provides a usable editor: click to add
// nodes, drag to move, Delete to remove, with a live status bar.

import './styles.css';
import { Tree } from './model/tree';
import { pt } from './model/geometry';
import { DesignView } from './view/designView';

export interface App {
  tree: Tree;
  view: DesignView;
}

export function mount(root: HTMLElement): App {
  root.replaceChildren();

  const toolbar = el('div', 'tm-toolbar');
  const host = el('div', 'tm-canvas-host');
  const sidebar = el('div', 'tm-sidebar');
  const status = el('div', 'tm-statusbar');
  sidebar.textContent = 'Inspector (coming next)';
  root.append(toolbar, host, sidebar, status);

  const tree = new Tree();
  const view = new DesignView(host, tree);

  const newBtn = button('New', () => {
    tree.loadState(new Tree().toState());
    view.selection.clear();
    view.refit();
    view.render();
  });
  const sampleBtn = button('Sample tree', () => {
    loadSample(tree);
    view.selection.clear();
    view.refit();
    view.render();
  });
  toolbar.append(strong('TreeMakerWeb'), newBtn, sampleBtn, hint('click empty to add a node · drag to move · Delete to remove'));

  const updateStatus = () => {
    status.textContent =
      `${tree.nodes.size} nodes · ${tree.edges.size} edges · ${tree.pathList().length} leaf paths · ` +
      `${tree.isFeasible ? 'feasible' : 'INFEASIBLE'}`;
  };
  tree.onChange(updateStatus);
  updateStatus();

  return { tree, view };
}

function loadSample(tree: Tree): void {
  tree.loadState(new Tree().toState()); // clear
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
function hint(text: string): HTMLElement {
  const s = document.createElement('span');
  s.textContent = text;
  s.style.cssText = 'margin-left:auto;color:#777;font-size:12px';
  return s;
}

const appRoot = document.getElementById('app');
if (appRoot) mount(appRoot);
