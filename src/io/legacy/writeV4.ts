// Writer for legacy TreeMaker version 4.0 documents. Used to hand the live tree
// to the WebAssembly optimizer (which reads v4/v5 text). Field orders mirror the
// C++ Putv4Self / PutRestv4 exactly (the inverse of readV4).
//
// The C++ reader wraps v4 loading in a tmTreeCleaner, so it recomputes derived
// flags and lengths from the topology after reading — we only need correct node
// positions, edge endpoints/length/strain, the leaf-path structure, and
// conditions. Parts are renumbered to dense 1-based file indices.

import type { Tree } from '../../model/tree';
import type { NodeId, EdgeId } from '../../model/types';
import type { Condition } from '../../model/conditions';

/** A node-pair path with its edge route through the tree. */
interface ExportPath {
  node1: NodeId;
  node2: NodeId;
  edges: EdgeId[];
  minTreeLength: number;
  minPaperLength: number;
  isLeaf: boolean;
}

/**
 * All node-pair paths (not just leaf paths). The C++ CleanupAfterEdit asserts
 * that a tree owns exactly C(n,2) paths and does not rebuild them on load, so a
 * faithful tree — required for crease-pattern building — needs every pair.
 */
function computeAllPaths(tree: Tree): ExportPath[] {
  const nodes = tree.nodeList();
  const adj = new Map<NodeId, { edge: EdgeId; other: NodeId }[]>();
  for (const n of nodes) adj.set(n.id, []);
  for (const e of tree.edgeList()) {
    adj.get(e.fromNode)?.push({ edge: e.id, other: e.toNode });
    adj.get(e.toNode)?.push({ edge: e.id, other: e.fromNode });
  }
  const out: ExportPath[] = [];
  const seen = new Set<string>();
  for (const src of nodes) {
    const parentEdge = new Map<NodeId, EdgeId>();
    const parentNode = new Map<NodeId, NodeId>();
    const visited = new Set<NodeId>([src.id]);
    const queue: NodeId[] = [src.id];
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
    for (const dst of nodes) {
      if (dst.id === src.id || !visited.has(dst.id)) continue;
      const key = src.id < dst.id ? `${src.id}-${dst.id}` : `${dst.id}-${src.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const edges: EdgeId[] = [];
      let cur = dst.id;
      while (cur !== src.id) { edges.push(parentEdge.get(cur)!); cur = parentNode.get(cur)!; }
      edges.reverse();
      let minTree = 0;
      let strained = 0;
      for (const eid of edges) { const e = tree.getEdge(eid)!; minTree += e.length; strained += e.length * (1 + e.strain); }
      out.push({
        node1: src.id, node2: dst.id, edges,
        minTreeLength: minTree,
        minPaperLength: tree.scale * strained,
        isLeaf: src.isLeaf && dst.isLeaf,
      });
    }
  }
  return out;
}

// The v4 spec wrote 6 fractional digits, but the reader just parses doubles, so
// we keep full precision: rounding node positions corrupts the optimizer's
// exactly-tangent active paths and makes the crease-pattern builder degenerate.
const f6 = (n: number): string => (Number.isInteger(n) ? n.toFixed(1) : String(n));
const b = (v: boolean): string => (v ? 'true' : 'false');

export function writeV4(tree: Tree): string {
  const nodes = tree.nodeList();
  const edges = tree.edgeList();
  const paths = computeAllPaths(tree); // ALL node-pair paths (see computeAllPaths)
  const conditions = tree.conditionList();

  // Dense 1-based file indices per part type.
  const nIdx = new Map<NodeId, number>();
  nodes.forEach((n, i) => nIdx.set(n.id, i + 1));
  const eIdx = new Map<EdgeId, number>();
  edges.forEach((e, i) => eIdx.set(e.id, i + 1));
  // Paths are indexed by their position in the all-pairs list.
  const pathKey = (a: NodeId, b: NodeId): string => (a < b ? `${a}-${b}` : `${b}-${a}`);
  const pIdxByPair = new Map<string, number>();
  paths.forEach((p, i) => pIdxByPair.set(pathKey(p.node1, p.node2), i + 1));

  const out: string[] = [];
  const w = (...t: (string | number)[]): void => { for (const x of t) out.push(String(x)); };
  const nodePtr = (id: number | undefined): string => String((id !== undefined && nIdx.get(id)) || 0);
  const edgePtr = (id: number | undefined): string => String((id !== undefined && eIdx.get(id)) || 0);
  const nodePtrArray = (ids: number[]): void => { w(ids.length); for (const id of ids) w(nodePtr(id)); };
  const edgePtrArray = (ids: number[]): void => { w(ids.length); for (const id of ids) w(edgePtr(id)); };

  // --- tree header ---
  w('tree', '4.0');
  w(f6(tree.paper.width), f6(tree.paper.height), f6(tree.scale));
  w(b(tree.symmetry.has), f6(tree.symmetry.loc.x), f6(tree.symmetry.loc.y), f6(tree.symmetry.angle));
  w(nodes.length, edges.length, paths.length, 0, 0, 0, conditions.length);

  // --- nodes ---
  for (const n of nodes) {
    const incident = tree.incident(n.id).map((x) => x.edge.id);
    const leafPathIdx = paths
      .filter((p) => p.isLeaf && (p.node1 === n.id || p.node2 === n.id))
      .map((p) => pIdxByPair.get(pathKey(p.node1, p.node2))!);
    w('node', nIdx.get(n.id)!, n.label, f6(n.loc.x), f6(n.loc.y));
    w(b(n.isLeaf), b(n.isSub), b(false), b(false), b(false), b(false));
    w(0); // owned vertices
    edgePtrArray(incident);
    w(leafPathIdx.length); for (const i of leafPathIdx) w(i);
    w(0); // node owner = tree (isPoly = 0)
  }

  // --- edges (no owner pointer in v4) ---
  for (const e of edges) {
    w('edge', eIdx.get(e.id)!, e.label, f6(e.length), f6(e.strain), f6(e.stiffness));
    w(b(false), b(false));
    nodePtrArray([e.fromNode, e.toNode]);
  }

  // --- paths (all node pairs) ---
  paths.forEach((p, i) => {
    w('path', i + 1, f6(p.minTreeLength), f6(p.minPaperLength));
    w(b(p.isLeaf), b(false), b(false), b(false), b(false), b(false));
    w(0, 0, 0); // owned vertices, fwd poly, bkd poly
    nodePtrArray([p.node1, p.node2]);
    edgePtrArray(p.edges);
    w(0); // path owner = tree
  });

  // --- conditions ---
  for (const c of conditions) writeCondition(c, w, nodePtr, edgePtr);

  // --- trailing owned-part arrays + 0 (no owned polys) ---
  nodePtrArray(nodes.map((n) => n.id));
  edgePtrArray(edges.map((e) => e.id));
  w(paths.length); for (let i = 1; i <= paths.length; i++) w(i); // owned paths 1..M
  w(0);

  return out.join('\n') + '\n';
}

type Writer = (...t: (string | number)[]) => void;

function writeCondition(c: Condition, w: Writer, nPtr: (id: number) => string, ePtr: (id: number) => string): void {
  switch (c.type) {
    case 'NodesPaired': w('CNpn', 2, nPtr(c.node1), nPtr(c.node2)); break;
    case 'NodeSymmetric': w('CNsn', 1, nPtr(c.node)); break;
    case 'PathActive': w('CNap', 2, nPtr(c.node1), nPtr(c.node2)); break;
    case 'NodeOnEdge': w('CNen', 1, nPtr(c.node)); break;
    case 'NodeOnCorner': w('CNkn', 1, nPtr(c.node)); break;
    case 'EdgesSameStrain': w('CNes', 2, ePtr(c.edge1), ePtr(c.edge2)); break;
    // Other condition types are not yet written to v4 (they don't appear in the
    // P1 import set); they are simply omitted. Tracked with the legacy follow-up.
    default: break;
  }
}
