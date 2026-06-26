// "Spec" format: a minimal whitespace-delimited description of the AUTHORITATIVE
// tree data (paper, scale, symmetry, node positions, edge topology). The Wasm
// builder (tmSpecBuildCP) reconstructs the tree natively via the C++ AddNode API
// — which maintains all derived structure (paths, polys) correctly — so we never
// hand-serialize the densely cross-linked derived data. Node indices are 0-based
// in tree.nodeList() order; the builder returns optimized positions in the same
// order.

import type { Tree } from '../model/tree';
import type { Condition } from '../model/conditions';

export function writeSpec(tree: Tree): string {
  const nodes = tree.nodeList();
  const nIdx = new Map(nodes.map((n, i) => [n.id, i]));
  const edges = tree.edgeList();
  const eIdx = new Map(edges.map((e, i) => [e.id, i]));
  const lines: string[] = [];
  const s = tree.symmetry;
  lines.push(`${tree.paper.width} ${tree.paper.height} ${tree.scale} ${s.has ? 1 : 0} ${s.loc.x} ${s.loc.y} ${s.angle}`);
  lines.push(String(nodes.length));
  for (const n of nodes) lines.push(`${n.loc.x} ${n.loc.y}`);
  lines.push(String(edges.length));
  for (const e of edges) lines.push(`${nIdx.get(e.fromNode)} ${nIdx.get(e.toNode)} ${e.length} ${e.strain} ${e.stiffness}`);

  // Conditions: only those whose referenced parts still exist (0-based indices).
  const condLines: string[] = [];
  for (const c of tree.conditionList()) {
    const line = conditionSpec(c, nIdx, eIdx);
    if (line) condLines.push(line);
  }
  lines.push(String(condLines.length));
  lines.push(...condLines);

  return lines.join('\n') + '\n';
}

/** Encode one condition, or null if a referenced part is missing. */
function conditionSpec(c: Condition, n: Map<number, number>, e: Map<number, number>): string | null {
  const ni = (id: number): number | undefined => n.get(id);
  const ei = (id: number): number | undefined => e.get(id);
  const ok = (...xs: (number | undefined)[]): boolean => xs.every((x) => x !== undefined);
  switch (c.type) {
    case 'NodeSymmetric': { const a = ni(c.node); return ok(a) ? `CNsn ${a}` : null; }
    case 'NodeOnEdge': { const a = ni(c.node); return ok(a) ? `CNen ${a}` : null; }
    case 'NodeOnCorner': { const a = ni(c.node); return ok(a) ? `CNkn ${a}` : null; }
    case 'NodeFixed': { const a = ni(c.node); return ok(a) ? `CNfn ${a} ${c.xFixed ? 1 : 0} ${c.yFixed ? 1 : 0} ${c.xFixValue} ${c.yFixValue}` : null; }
    case 'NodesPaired': { const a = ni(c.node1), b = ni(c.node2); return ok(a, b) ? `CNpn ${a} ${b}` : null; }
    case 'NodesCollinear': { const a = ni(c.node1), b = ni(c.node2), d = ni(c.node3); return ok(a, b, d) ? `CNcn ${a} ${b} ${d}` : null; }
    case 'EdgeLengthFixed': { const a = ei(c.edge); return ok(a) ? `CNfe ${a}` : null; }
    case 'EdgesSameStrain': { const a = ei(c.edge1), b = ei(c.edge2); return ok(a, b) ? `CNes ${a} ${b}` : null; }
    case 'PathActive': { const a = ni(c.node1), b = ni(c.node2); return ok(a, b) ? `CNap ${a} ${b}` : null; }
    case 'PathAngleFixed': { const a = ni(c.node1), b = ni(c.node2); return ok(a, b) ? `CNfp ${a} ${b} ${c.angle}` : null; }
    case 'PathAngleQuant': { const a = ni(c.node1), b = ni(c.node2); return ok(a, b) ? `CNqp ${a} ${b} ${c.quant} ${c.quantOffset}` : null; }
  }
}
