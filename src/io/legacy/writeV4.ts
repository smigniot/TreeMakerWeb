// Writer for legacy TreeMaker version 4.0 documents. Used to hand the live tree
// to the WebAssembly optimizer (which reads v4/v5 text). Field orders mirror the
// C++ Putv4Self / PutRestv4 exactly (the inverse of readV4).
//
// The C++ reader wraps v4 loading in a tmTreeCleaner, so it recomputes derived
// flags and lengths from the topology after reading — we only need correct node
// positions, edge endpoints/length/strain, the leaf-path structure, and
// conditions. Parts are renumbered to dense 1-based file indices.

import type { Tree } from '../../model/tree';
import type { NodeId, EdgeId, PathId } from '../../model/types';
import type { Condition } from '../../model/conditions';

const f6 = (n: number): string => n.toFixed(6);
const b = (v: boolean): string => (v ? 'true' : 'false');

export function writeV4(tree: Tree): string {
  const nodes = tree.nodeList();
  const edges = tree.edgeList();
  const paths = tree.pathList().filter((p) => p.isLeafPath);
  const conditions = tree.conditionList();

  // Dense 1-based file indices per part type.
  const nIdx = new Map<NodeId, number>();
  nodes.forEach((n, i) => nIdx.set(n.id, i + 1));
  const eIdx = new Map<EdgeId, number>();
  edges.forEach((e, i) => eIdx.set(e.id, i + 1));
  const pIdx = new Map<PathId, number>();
  paths.forEach((p, i) => pIdx.set(p.id, i + 1));

  const out: string[] = [];
  const w = (...t: (string | number)[]): void => { for (const x of t) out.push(String(x)); };
  const ptr = (id: number | undefined, m: Map<number, number>): string => String((id !== undefined && m.get(id)) || 0);
  const ptrArray = (ids: number[], m: Map<number, number>): void => { w(ids.length); for (const id of ids) w(ptr(id, m)); };

  // --- tree header ---
  w('tree', '4.0');
  w(f6(tree.paper.width), f6(tree.paper.height), f6(tree.scale));
  w(b(tree.symmetry.has), f6(tree.symmetry.loc.x), f6(tree.symmetry.loc.y), f6(tree.symmetry.angle));
  w(nodes.length, edges.length, paths.length, 0, 0, 0, conditions.length);

  // --- nodes ---
  for (const n of nodes) {
    const incident = tree.incident(n.id).map((x) => x.edge.id);
    const leafPaths = paths.filter((p) => p.node1 === n.id || p.node2 === n.id).map((p) => p.id);
    w('node', nIdx.get(n.id)!, n.label, f6(n.loc.x), f6(n.loc.y));
    w(b(n.isLeaf), b(n.isSub), b(false), b(false), b(false), b(false));
    w(0); // owned vertices
    ptrArray(incident, eIdx);
    ptrArray(leafPaths, pIdx);
    w(0); // node owner = tree (isPoly = 0)
  }

  // --- edges (no owner pointer in v4) ---
  for (const e of edges) {
    w('edge', eIdx.get(e.id)!, e.label, f6(e.length), f6(e.strain), f6(e.stiffness));
    w(b(false), b(false));
    ptrArray([e.fromNode, e.toNode], nIdx);
  }

  // --- paths ---
  for (const p of paths) {
    w('path', pIdx.get(p.id)!, f6(p.minTreeLength), f6(p.minPaperLength));
    w(b(p.isLeafPath), b(false), b(p.isActive), b(false), b(false), b(false));
    w(0, 0, 0); // owned vertices, fwd poly, bkd poly
    ptrArray([p.node1, p.node2], nIdx);
    ptrArray(p.edges, eIdx);
    w(0); // path owner = tree
  }

  // --- conditions ---
  for (const c of conditions) writeCondition(c, w, (id) => ptr(id, nIdx), (id) => ptr(id, eIdx));

  // --- trailing owned-part arrays + 0 (no owned polys) ---
  ptrArray(nodes.map((n) => n.id), nIdx);
  ptrArray(edges.map((e) => e.id), eIdx);
  ptrArray(paths.map((p) => p.id), pIdx);
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
