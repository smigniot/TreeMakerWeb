// The pure-SVG design surface: renders the tree and handles direct-manipulation
// editing (add node by clicking, select, drag to move, delete). Mirrors the
// behavior of the C++ tmwxDesignCanvas (draw order, click priority, add-node
// rules) but uses retained SVG with data-attribute hit-testing instead of an
// immediate-mode canvas. See docs/analysis/04-gui-interactions.md.

import type { Tree } from '../model/tree';
import type { Point } from '../model/geometry';
import { dist } from '../model/geometry';
import type { NodeId } from '../model/types';
import { ViewTransform } from './transform';
import { Selection, type PartRef } from './selection';
import type { ViewSettings } from './viewSettings';
import { defaultViewSettings } from './viewSettings';
import { svgEl, tagPart, partFromEvent } from './svg';

const NODE_R = 5; // px
/** Below this pointer travel (px) a drag counts as a click. */
const DRAG_THRESHOLD = 3;

interface DragState {
  startPaper: Point;
  startLocs: Map<NodeId, Point>;
  moved: boolean;
}

export class DesignView {
  readonly selection: Selection;
  settings: ViewSettings;

  private svg: SVGSVGElement;
  private layers: Record<'paper' | 'paths' | 'edges' | 'nodes' | 'conditions' | 'labels', SVGGElement>;
  private xf: ViewTransform;
  private drag: DragState | null = null;
  private disposers: Array<() => void> = [];

  constructor(
    private container: HTMLElement,
    private tree: Tree,
    opts: { selection?: Selection; settings?: ViewSettings } = {},
  ) {
    this.selection = opts.selection ?? new Selection();
    this.settings = opts.settings ?? defaultViewSettings();
    this.xf = new ViewTransform(tree.paper.width, tree.paper.height);

    this.svg = svgEl('svg', { class: 'tm-design', width: '100%', height: '100%' });
    this.svg.style.touchAction = 'none';
    this.svg.style.userSelect = 'none';
    this.svg.setAttribute('tabindex', '0');
    this.layers = {
      paper: svgEl('g', { class: 'tm-layer-paper' }),
      paths: svgEl('g', { class: 'tm-layer-paths' }),
      edges: svgEl('g', { class: 'tm-layer-edges' }),
      nodes: svgEl('g', { class: 'tm-layer-nodes' }),
      conditions: svgEl('g', { class: 'tm-layer-conditions' }),
      labels: svgEl('g', { class: 'tm-layer-labels' }),
    };
    for (const g of Object.values(this.layers)) this.svg.appendChild(g);
    container.appendChild(this.svg);

    this.disposers.push(this.tree.onChange(() => this.render()));
    this.disposers.push(this.selection.onChange(() => this.render()));
    this.bindPointer();
    this.bindKeys();
    this.observeResize();
    this.refit();
    this.render();
  }

  dispose(): void {
    for (const d of this.disposers) d();
    this.svg.remove();
  }

  // --------------------------------------------------------------- layout
  private viewport(): { width: number; height: number } {
    const r = this.container.getBoundingClientRect();
    return { width: r.width || 800, height: r.height || 600 };
  }

  refit(): void {
    this.xf = new ViewTransform(this.tree.paper.width, this.tree.paper.height);
    this.xf.fit(this.viewport());
  }

  private observeResize(): void {
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => { this.refit(); this.render(); });
    ro.observe(this.container);
    this.disposers.push(() => ro.disconnect());
  }

  // --------------------------------------------------------------- rendering
  render(): void {
    for (const g of Object.values(this.layers)) g.replaceChildren();
    this.renderPaper();
    if (this.settings.showPaths) this.renderPaths();
    if (this.settings.showEdges) this.renderEdges();
    if (this.settings.showNodes) this.renderNodes();
    if (this.settings.showConditions) this.renderConditions();
    this.renderLabels();
  }

  private renderPaper(): void {
    if (!this.settings.showPaper) return;
    const tl = this.xf.toScreen({ x: 0, y: this.tree.paper.height });
    const w = this.xf.lenToScreen(this.tree.paper.width);
    const h = this.xf.lenToScreen(this.tree.paper.height);
    this.layers.paper.appendChild(
      svgEl('rect', { x: tl.x, y: tl.y, width: w, height: h, class: 'tm-paper' }),
    );
    if (this.settings.showSymmetryLine && this.tree.symmetry.has) {
      const { loc, angle } = this.tree.symmetry;
      const a = (angle * Math.PI) / 180;
      const big = this.tree.paper.width + this.tree.paper.height;
      const p1 = this.xf.toScreen({ x: loc.x - Math.cos(a) * big, y: loc.y - Math.sin(a) * big });
      const p2 = this.xf.toScreen({ x: loc.x + Math.cos(a) * big, y: loc.y + Math.sin(a) * big });
      this.layers.paper.appendChild(
        svgEl('line', { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, class: 'tm-symline' }),
      );
    }
  }

  private renderEdges(): void {
    for (const e of this.tree.edgeList()) {
      const a = this.tree.getNode(e.fromNode);
      const b = this.tree.getNode(e.toNode);
      if (!a || !b) continue;
      const pa = this.xf.toScreen(a.loc);
      const pb = this.xf.toScreen(b.loc);
      const line = svgEl('line', { x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y, class: 'tm-edge' });
      if (this.selection.has({ kind: 'edge', id: e.id })) line.classList.add('tm-selected');
      tagPart(line, 'edge', e.id);
      this.layers.edges.appendChild(line);
    }
  }

  private renderPaths(): void {
    for (const p of this.tree.pathList()) {
      if (!p.isLeafPath) continue;
      const a = this.tree.getNode(p.node1);
      const b = this.tree.getNode(p.node2);
      if (!a || !b) continue;
      const pa = this.xf.toScreen(a.loc);
      const pb = this.xf.toScreen(b.loc);
      const cls = p.isActive ? 'tm-path-active' : p.isFeasible ? 'tm-path-feasible' : 'tm-path-infeasible';
      const line = svgEl('line', { x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y, class: `tm-path ${cls}` });
      tagPart(line, 'path', p.id);
      this.layers.paths.appendChild(line);
    }
  }

  private renderNodes(): void {
    for (const n of this.tree.nodeList()) {
      const s = this.xf.toScreen(n.loc);
      const c = svgEl('circle', { cx: s.x, cy: s.y, r: NODE_R, class: 'tm-node' });
      if (n.isLeaf) c.classList.add('tm-leaf');
      if (n.isSub) c.classList.add('tm-sub');
      if (this.selection.has({ kind: 'node', id: n.id })) c.classList.add('tm-selected');
      tagPart(c, 'node', n.id);
      this.layers.nodes.appendChild(c);
    }
  }

  private renderConditions(): void {
    // Minimal: a small marker offset from the owning node for node conditions.
    for (const cond of this.tree.conditionList()) {
      const nodeId = conditionAnchorNode(cond);
      if (nodeId === null) continue;
      const node = this.tree.getNode(nodeId);
      if (!node) continue;
      const s = this.xf.toScreen(node.loc);
      const mark = svgEl('rect', { x: s.x + 7, y: s.y - 11, width: 8, height: 8, class: 'tm-condition' });
      const feas = this.tree.conditionFeasible(cond);
      if (feas === false) mark.classList.add('tm-infeasible');
      tagPart(mark, 'condition', cond.id);
      this.layers.conditions.appendChild(mark);
    }
  }

  private renderLabels(): void {
    if (this.settings.showNodeIndices || this.settings.showNodeLabels) {
      for (const n of this.tree.nodeList()) {
        const s = this.xf.toScreen(n.loc);
        const parts: string[] = [];
        if (this.settings.showNodeIndices) parts.push(String(n.id));
        if (this.settings.showNodeLabels && n.label) parts.push(n.label);
        if (!parts.length) continue;
        const t = svgEl('text', { x: s.x + NODE_R + 2, y: s.y - NODE_R, class: 'tm-label' });
        t.textContent = parts.join(' ');
        this.layers.labels.appendChild(t);
      }
    }
    if (this.settings.showEdgeLengths) {
      for (const e of this.tree.edgeList()) {
        const a = this.tree.getNode(e.fromNode);
        const b = this.tree.getNode(e.toNode);
        if (!a || !b) continue;
        const mid = this.xf.toScreen({ x: (a.loc.x + b.loc.x) / 2, y: (a.loc.y + b.loc.y) / 2 });
        const t = svgEl('text', { x: mid.x, y: mid.y, class: 'tm-label tm-edge-label' });
        t.textContent = e.length.toFixed(2);
        this.layers.labels.appendChild(t);
      }
    }
  }

  // --------------------------------------------------------------- interaction
  private bindPointer(): void {
    const onDown = (e: PointerEvent) => this.onPointerDown(e);
    this.svg.addEventListener('pointerdown', onDown);
    this.disposers.push(() => this.svg.removeEventListener('pointerdown', onDown));
  }

  private pointerPaper(e: PointerEvent): Point {
    const r = this.svg.getBoundingClientRect();
    return this.xf.toPaper(e.clientX - r.left, e.clientY - r.top);
  }

  private onPointerDown(e: PointerEvent): void {
    this.svg.focus();
    const hit = partFromEvent(e);
    const paper = this.pointerPaper(e);

    if (hit) {
      const ref: PartRef = { kind: hit.kind as PartRef['kind'], id: hit.id };
      if (e.shiftKey) this.selection.toggle(ref);
      else if (!this.selection.has(ref)) this.selection.set(ref);

      if (ref.kind === 'node' || this.selection.nodes().length) {
        this.beginDrag(e, paper);
      }
      return;
    }

    // Empty space.
    if (e.shiftKey) return;
    if (this.tree.nodes.size === 0) {
      const n = this.tree.addNode(paper);
      this.selection.set({ kind: 'node', id: n.id });
      return;
    }
    const sole = this.selection.single();
    if (sole && sole.kind === 'node' && !this.tree.getNode(sole.id)?.isSub) {
      const { node } = this.tree.addNodeFrom(sole.id, paper);
      this.selection.set({ kind: 'node', id: node.id });
      return;
    }
    this.selection.clear();
  }

  private beginDrag(e: PointerEvent, startPaper: Point): void {
    const startLocs = new Map<NodeId, Point>();
    for (const id of this.selection.nodes()) {
      const n = this.tree.getNode(id);
      if (n) startLocs.set(id, { ...n.loc });
    }
    if (!startLocs.size) return;
    this.drag = { startPaper, startLocs, moved: false };
    this.svg.setPointerCapture?.(e.pointerId);

    const onMove = (ev: PointerEvent) => this.onDragMove(ev);
    const onUp = (ev: PointerEvent) => {
      this.svg.releasePointerCapture?.(ev.pointerId);
      this.svg.removeEventListener('pointermove', onMove);
      this.svg.removeEventListener('pointerup', onUp);
      this.drag = null;
    };
    this.svg.addEventListener('pointermove', onMove);
    this.svg.addEventListener('pointerup', onUp);
  }

  private onDragMove(e: PointerEvent): void {
    if (!this.drag) return;
    const now = this.pointerPaper(e);
    const dx = now.x - this.drag.startPaper.x;
    const dy = now.y - this.drag.startPaper.y;
    const travelPx = this.xf.lenToScreen(dist({ x: 0, y: 0 }, { x: dx, y: dy }));
    if (!this.drag.moved && travelPx < DRAG_THRESHOLD) return;
    this.drag.moved = true;
    const locs = new Map<NodeId, Point>();
    for (const [id, start] of this.drag.startLocs) locs.set(id, { x: start.x + dx, y: start.y + dy });
    this.tree.moveNodes(locs);
  }

  private bindKeys(): void {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { this.selection.clear(); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const nodes = this.selection.nodes();
        const edges = this.selection.list().filter((r) => r.kind === 'edge').map((r) => r.id);
        if (nodes.length || edges.length) {
          e.preventDefault();
          this.tree.edit(() => {
            if (edges.length) this.tree.deleteEdges(edges);
            if (nodes.length) this.tree.deleteNodes(nodes);
          });
          this.selection.prune((r) =>
            (r.kind === 'node' && this.tree.nodes.has(r.id)) ||
            (r.kind === 'edge' && this.tree.edges.has(r.id)) ||
            (r.kind === 'condition' && this.tree.conditions.has(r.id)) ||
            (r.kind === 'path'),
          );
        }
      }
    };
    this.svg.addEventListener('keydown', onKey);
    this.disposers.push(() => this.svg.removeEventListener('keydown', onKey));
  }
}

function conditionAnchorNode(c: import('../model/conditions').Condition): NodeId | null {
  switch (c.type) {
    case 'NodeFixed':
    case 'NodeOnEdge':
    case 'NodeOnCorner':
    case 'NodeSymmetric':
      return c.node;
    case 'NodesPaired':
    case 'PathActive':
    case 'PathAngleFixed':
    case 'PathAngleQuant':
      return c.node1;
    default:
      return null;
  }
}
