// Bridge between the live TS tree and the WebAssembly optimizer: serialize the
// tree to v4 text, run an optimization pass, and apply the results (scale, node
// positions, edge strains) back as a single undoable edit.
//
// The optimizer reports parts by their 1-based v4 file index, which equals each
// part's position in tree.nodeList()/edgeList() at export time — captured here
// before the call so we can map results back.

import type { Tree } from '../model/tree';
import { writeV4 } from '../io/legacy/writeV4';
import { optimize, OptimizeMode, type OptimizeResult } from '../wasm/engine';

export { OptimizeMode };

export async function optimizeTree(tree: Tree, mode: OptimizeMode): Promise<OptimizeResult> {
  const orderedNodes = tree.nodeList();
  const orderedEdges = tree.edgeList();
  const text = writeV4(tree);

  const res = await optimize(text, mode);
  if (!res.ok) throw new Error(res.error ?? 'optimization failed');

  tree.edit(() => {
    if (mode === OptimizeMode.Scale) tree.setScale(res.scale);
    for (const rn of res.nodes) {
      const n = orderedNodes[rn.i - 1];
      if (n) tree.moveNode(n.id, { x: rn.x, y: rn.y });
    }
    for (const re of res.edges) {
      const e = orderedEdges[re.i - 1];
      if (e) tree.setEdgeProps(e.id, { strain: re.strain });
    }
  });
  return res;
}
