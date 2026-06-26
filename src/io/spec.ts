// "Spec" format: a minimal whitespace-delimited description of the AUTHORITATIVE
// tree data (paper, scale, symmetry, node positions, edge topology). The Wasm
// builder (tmSpecBuildCP) reconstructs the tree natively via the C++ AddNode API
// — which maintains all derived structure (paths, polys) correctly — so we never
// hand-serialize the densely cross-linked derived data. Node indices are 0-based
// in tree.nodeList() order; the builder returns optimized positions in the same
// order.

import type { Tree } from '../model/tree';

export function writeSpec(tree: Tree): string {
  const nodes = tree.nodeList();
  const idx = new Map(nodes.map((n, i) => [n.id, i]));
  const edges = tree.edgeList();
  const lines: string[] = [];
  const s = tree.symmetry;
  lines.push(`${tree.paper.width} ${tree.paper.height} ${tree.scale} ${s.has ? 1 : 0} ${s.loc.x} ${s.loc.y} ${s.angle}`);
  lines.push(String(nodes.length));
  for (const n of nodes) lines.push(`${n.loc.x} ${n.loc.y}`);
  lines.push(String(edges.length));
  for (const e of edges) lines.push(`${idx.get(e.fromNode)} ${idx.get(e.toNode)} ${e.length} ${e.strain} ${e.stiffness}`);
  return lines.join('\n') + '\n';
}
