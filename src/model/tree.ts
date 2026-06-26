// The Tree aggregate: owns all parts, exposes editing operations, and rebuilds
// derived state (paths, flags, feasibility) after each edit.
//
// Editing is wrapped in depth-counted scopes (edit()/beginEdit()/endEdit()),
// replacing the C++ tmTreeCleaner RAII guard: cleanup runs exactly once when the
// outermost edit closes. See docs/analysis/01-core-model.md §3.2/§3.4.
//
// P1 scope: tree topology + geometry + leaf paths + feasibility. Polygons,
// creases, facets, and the optimizer are P2/P3.

import type { Point } from './geometry';
import { dist, clampToPaper } from './geometry';
import type {
  TreeNode, Edge, Path, Paper, Symmetry, NodeId, EdgeId, PathId, ConditionId,
} from './types';
import { DIST_TOL, MIN_EDGE_LENGTH } from './types';
import type { Condition, ConditionContext, NewCondition } from './conditions';
import { conditionFeasible } from './conditions';

export type ChangeListener = (tree: Tree) => void;

export class Tree {
  paper: Paper = { width: 1, height: 1 };
  scale = 0.1;
  symmetry: Symmetry = { has: false, loc: { x: 0.5, y: 0.5 }, angle: 90 };
  rootNode: NodeId | null = null;

  // --- readonly to the outside; mutated only through operations + cleanup ---
  readonly nodes = new Map<NodeId, TreeNode>();
  readonly edges = new Map<EdgeId, Edge>();
  readonly paths = new Map<PathId, Path>();
  readonly conditions = new Map<ConditionId, Condition>();

  /** Whole-tree feasibility (every leaf path satisfied). */
  isFeasible = true;
  /** Bumped on every cleanup; lets views cheaply detect changes. */
  version = 0;

  private nextNodeId = 1;
  private nextEdgeId = 1;
  private nextPathId = 1;
  private nextConditionId = 1;

  private editDepth = 0;
  private dirty = false;
  private listeners = new Set<ChangeListener>();

  // ---------------------------------------------------------------- edit scope
  beginEdit(): void {
    this.editDepth++;
  }

  endEdit(): void {
    if (this.editDepth === 0) throw new Error('endEdit without beginEdit');
    this.editDepth--;
    if (this.editDepth === 0 && this.dirty) {
      this.cleanup();
      this.dirty = false;
      this.notify();
    }
  }

  /** Run a mutation in an edit scope; cleanup fires once at the end. */
  edit<T>(fn: () => T): T {
    this.beginEdit();
    try {
      return fn();
    } finally {
      this.endEdit();
    }
  }

  private touch(): void {
    this.dirty = true;
  }

  onChange(fn: ChangeListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify(): void {
    for (const fn of this.listeners) fn(this);
  }

  // ------------------------------------------------------------------ topology
  /** Add a standalone node (becomes the root if the tree was empty). */
  addNode(loc: Point): TreeNode {
    return this.edit(() => {
      const node: TreeNode = {
        id: this.nextNodeId++,
        loc: clampToPaper(loc, this.paper.width, this.paper.height),
        label: '',
        isLeaf: true,
        isSub: false,
      };
      this.nodes.set(node.id, node);
      if (this.rootNode === null) this.rootNode = node.id;
      this.touch();
      return node;
    });
  }

  /** Add a child node connected to `fromId` by a new unit-length edge. */
  addNodeFrom(fromId: NodeId, loc: Point): { node: TreeNode; edge: Edge } {
    return this.edit(() => {
      if (!this.nodes.has(fromId)) throw new Error(`no node ${fromId}`);
      const node = this.addNode(loc);
      const edge = this.connect(fromId, node.id, 1);
      this.touch();
      return { node, edge };
    });
  }

  /** Create an edge between two existing nodes. */
  connect(fromId: NodeId, toId: NodeId, length = 1): Edge {
    return this.edit(() => {
      if (!this.nodes.has(fromId) || !this.nodes.has(toId)) throw new Error('bad node');
      const edge: Edge = {
        id: this.nextEdgeId++,
        fromNode: fromId,
        toNode: toId,
        length: Math.max(MIN_EDGE_LENGTH, length),
        strain: 0,
        stiffness: 1,
        label: '',
      };
      this.edges.set(edge.id, edge);
      this.touch();
      return edge;
    });
  }

  /** Split an edge by inserting a sub-node at `loc`, replacing it with two edges. */
  splitEdge(edgeId: EdgeId, loc: Point): TreeNode {
    return this.edit(() => {
      const edge = this.edges.get(edgeId);
      if (!edge) throw new Error(`no edge ${edgeId}`);
      const mid = this.addNode(loc);
      mid.isSub = true;
      const half = edge.length / 2;
      this.connect(edge.fromNode, mid.id, half);
      this.connect(mid.id, edge.toNode, half);
      this.edges.delete(edgeId);
      this.touch();
      return mid;
    });
  }

  moveNode(id: NodeId, loc: Point): void {
    this.edit(() => {
      const node = this.nodes.get(id);
      if (!node) throw new Error(`no node ${id}`);
      node.loc = clampToPaper(loc, this.paper.width, this.paper.height);
      this.touch();
    });
  }

  moveNodes(locs: ReadonlyMap<NodeId, Point>): void {
    this.edit(() => {
      for (const [id, loc] of locs) this.moveNode(id, loc);
    });
  }

  /** Delete nodes and any edges/conditions/paths that reference them. */
  deleteNodes(ids: Iterable<NodeId>): void {
    this.edit(() => {
      const set = new Set(ids);
      for (const id of set) this.nodes.delete(id);
      for (const [eid, e] of this.edges) {
        if (set.has(e.fromNode) || set.has(e.toNode)) this.edges.delete(eid);
      }
      for (const [cid, c] of this.conditions) {
        if (conditionRefsAnyNode(c, set)) this.conditions.delete(cid);
      }
      if (this.rootNode !== null && set.has(this.rootNode)) {
        this.rootNode = this.nodes.size ? this.nodes.keys().next().value! : null;
      }
      this.touch();
    });
  }

  deleteEdges(ids: Iterable<EdgeId>): void {
    this.edit(() => {
      for (const id of ids) this.edges.delete(id);
      this.touch();
    });
  }

  // -------------------------------------------------------------- edge / paper
  setEdgeLength(id: EdgeId, length: number): void {
    this.edit(() => {
      const e = this.edges.get(id);
      if (!e) throw new Error(`no edge ${id}`);
      e.length = Math.max(MIN_EDGE_LENGTH, length);
      this.touch();
    });
  }

  setEdgeProps(id: EdgeId, props: Partial<Pick<Edge, 'length' | 'strain' | 'stiffness' | 'label'>>): void {
    this.edit(() => {
      const e = this.edges.get(id);
      if (!e) throw new Error(`no edge ${id}`);
      if (props.length !== undefined) e.length = Math.max(MIN_EDGE_LENGTH, props.length);
      if (props.strain !== undefined) e.strain = Math.max(-1, props.strain);
      if (props.stiffness !== undefined) e.stiffness = Math.max(MIN_EDGE_LENGTH, props.stiffness);
      if (props.label !== undefined) e.label = props.label;
      this.touch();
    });
  }

  setNodeLabel(id: NodeId, label: string): void {
    this.edit(() => {
      const n = this.nodes.get(id);
      if (!n) throw new Error(`no node ${id}`);
      n.label = label;
      this.touch();
    });
  }

  setPaper(width: number, height: number): void {
    this.edit(() => {
      this.paper = { width: Math.max(MIN_EDGE_LENGTH, width), height: Math.max(MIN_EDGE_LENGTH, height) };
      // re-clamp nodes into the new paper
      for (const n of this.nodes.values()) n.loc = clampToPaper(n.loc, this.paper.width, this.paper.height);
      this.touch();
    });
  }

  setScale(scale: number): void {
    this.edit(() => {
      this.scale = Math.max(0, scale);
      this.touch();
    });
  }

  setSymmetry(sym: Partial<Symmetry>): void {
    this.edit(() => {
      this.symmetry = { ...this.symmetry, ...sym };
      this.touch();
    });
  }

  // ------------------------------------------------------------- conditions
  addCondition(c: NewCondition): Condition {
    return this.edit(() => {
      const full = { ...c, id: this.nextConditionId++ } as Condition;
      this.conditions.set(full.id, full);
      this.touch();
      return full;
    });
  }

  removeCondition(id: ConditionId): void {
    this.edit(() => {
      this.conditions.delete(id);
      this.touch();
    });
  }

  // ---------------------------------------------------------------- accessors
  getNode(id: NodeId): TreeNode | undefined { return this.nodes.get(id); }
  getEdge(id: EdgeId): Edge | undefined { return this.edges.get(id); }
  nodeList(): TreeNode[] { return [...this.nodes.values()]; }
  edgeList(): Edge[] { return [...this.edges.values()]; }
  pathList(): Path[] { return [...this.paths.values()]; }
  conditionList(): Condition[] { return [...this.conditions.values()]; }

  /** Edges incident to a node, with the node at the other end. */
  incident(id: NodeId): { edge: Edge; other: NodeId }[] {
    const out: { edge: Edge; other: NodeId }[] = [];
    for (const e of this.edges.values()) {
      if (e.fromNode === id) out.push({ edge: e, other: e.toNode });
      else if (e.toNode === id) out.push({ edge: e, other: e.fromNode });
    }
    return out;
  }

  // ------------------------------------------------------------------ cleanup
  /** Recompute derived state. Public for IO (after bulk load) and tests. */
  cleanup(): void {
    this.recomputeNodeFlags();
    this.rebuildLeafPaths();
    this.recomputeFeasibility();
    this.version++;
  }

  private recomputeNodeFlags(): void {
    const degree = new Map<NodeId, number>();
    for (const id of this.nodes.keys()) degree.set(id, 0);
    for (const e of this.edges.values()) {
      degree.set(e.fromNode, (degree.get(e.fromNode) ?? 0) + 1);
      degree.set(e.toNode, (degree.get(e.toNode) ?? 0) + 1);
    }
    for (const n of this.nodes.values()) n.isLeaf = degree.get(n.id) === 1;
  }

  private adjacency(): Map<NodeId, { edge: EdgeId; other: NodeId }[]> {
    const adj = new Map<NodeId, { edge: EdgeId; other: NodeId }[]>();
    for (const id of this.nodes.keys()) adj.set(id, []);
    for (const e of this.edges.values()) {
      adj.get(e.fromNode)!.push({ edge: e.id, other: e.toNode });
      adj.get(e.toNode)!.push({ edge: e.id, other: e.fromNode });
    }
    return adj;
  }

  /** Build the unique routes between every pair of leaf nodes. */
  private rebuildLeafPaths(): void {
    this.paths.clear();
    this.nextPathId = 1;
    const adj = this.adjacency();
    const leaves = this.nodeList().filter((n) => n.isLeaf).map((n) => n.id);
    const seen = new Set<string>();

    for (const src of leaves) {
      // BFS from src, recording the edge used to reach each node.
      const parentEdge = new Map<NodeId, EdgeId>();
      const parentNode = new Map<NodeId, NodeId>();
      const queue: NodeId[] = [src];
      const visited = new Set<NodeId>([src]);
      while (queue.length) {
        const cur = queue.shift()!;
        for (const { edge, other } of adj.get(cur)!) {
          if (visited.has(other)) continue;
          visited.add(other);
          parentEdge.set(other, edge);
          parentNode.set(other, cur);
          queue.push(other);
        }
      }
      for (const dst of leaves) {
        if (dst === src || !visited.has(dst)) continue;
        const key = src < dst ? `${src}-${dst}` : `${dst}-${src}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const edges: EdgeId[] = [];
        let cur = dst;
        while (cur !== src) {
          edges.push(parentEdge.get(cur)!);
          cur = parentNode.get(cur)!;
        }
        edges.reverse();
        this.paths.set(this.nextPathId, this.makePath(this.nextPathId, src, dst, edges));
        this.nextPathId++;
      }
    }
  }

  private makePath(id: PathId, n1: NodeId, n2: NodeId, edgeIds: EdgeId[]): Path {
    let minTree = 0;
    let strainedSum = 0;
    for (const eid of edgeIds) {
      const e = this.edges.get(eid)!;
      minTree += e.length;
      strainedSum += e.length * (1 + e.strain);
    }
    const minPaper = this.scale * strainedSum;
    const a = this.nodes.get(n1)!.loc;
    const b = this.nodes.get(n2)!.loc;
    const act = dist(a, b);
    const n1Leaf = this.nodes.get(n1)!.isLeaf;
    const n2Leaf = this.nodes.get(n2)!.isLeaf;
    return {
      id, node1: n1, node2: n2, edges: edgeIds,
      isLeafPath: n1Leaf && n2Leaf,
      minTreeLength: minTree,
      minPaperLength: minPaper,
      actPaperLength: act,
      isActive: Math.abs(act - minPaper) <= DIST_TOL,
      isFeasible: act >= minPaper - DIST_TOL,
    };
  }

  private recomputeFeasibility(): void {
    let feasible = true;
    for (const p of this.paths.values()) if (p.isLeafPath && !p.isFeasible) feasible = false;
    this.isFeasible = feasible;
  }

  // --------------------------------------------------------- condition context
  conditionContext(): ConditionContext {
    const activePairs = new Set<string>();
    for (const p of this.paths.values()) {
      if (p.isActive) activePairs.add(pairKey(p.node1, p.node2));
    }
    return {
      nodeLoc: (id) => this.nodes.get(id)?.loc,
      edgeStrain: (id) => this.edges.get(id)?.strain,
      pathActive: (a, b) => activePairs.has(pairKey(a, b)),
      paper: this.paper,
      symmetry: this.symmetry,
    };
  }

  conditionFeasible(c: Condition): boolean | undefined {
    return conditionFeasible(c, this.conditionContext());
  }
}

function pairKey(a: NodeId, b: NodeId): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

function conditionRefsAnyNode(c: Condition, set: ReadonlySet<NodeId>): boolean {
  switch (c.type) {
    case 'NodeFixed':
    case 'NodeOnEdge':
    case 'NodeOnCorner':
    case 'NodeSymmetric':
      return set.has(c.node);
    case 'NodesPaired':
    case 'PathActive':
    case 'PathAngleFixed':
    case 'PathAngleQuant':
      return set.has(c.node1) || set.has(c.node2);
    case 'NodesCollinear':
      return set.has(c.node1) || set.has(c.node2) || set.has(c.node3);
    case 'EdgeLengthFixed':
    case 'EdgesSameStrain':
      return false; // edge-based; handled when edges are removed
  }
}
