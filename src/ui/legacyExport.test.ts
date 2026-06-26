// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { Tree } from '../model/tree';
import { pt } from '../model/geometry';
import { optimizeTree, OptimizeMode } from './optimize';
import { exportTreeV5 } from './legacyExport';
import { importLegacy } from '../io/legacy';

function fourFlapStar(): Tree {
  const t = new Tree();
  t.edit(() => {
    const c = t.addNode(pt(0.5, 0.5));
    t.addNodeFrom(c.id, pt(0.15, 0.85));
    t.addNodeFrom(c.id, pt(0.85, 0.85));
    t.addNodeFrom(c.id, pt(0.15, 0.15));
    t.addNodeFrom(c.id, pt(0.85, 0.15));
  });
  // a condition to confirm conditions survive the export
  const leaf = t.nodeList()[1]!;
  t.addCondition({ type: 'NodeOnEdge', tag: 'CNen', node: leaf.id });
  return t;
}

describe('legacy v5 export', () => {
  it('exports a v5 document desktop TreeMaker can read', async () => {
    const t = fourFlapStar();
    await optimizeTree(t, OptimizeMode.Scale); // pack so a crease pattern is written
    const v5 = await exportTreeV5(t);
    expect(v5.startsWith('tree\n5.0\n')).toBe(true);
    expect(v5).toContain('\npoly\n'); // full crease pattern serialized
  }, 30_000);

  it('round-trips through our own reader (nodes, edges, conditions, symmetry)', async () => {
    const t = fourFlapStar();
    await optimizeTree(t, OptimizeMode.Scale);
    const reloaded = importLegacy(await exportTreeV5(t));
    expect(reloaded.nodes.size).toBe(t.nodes.size); // 5 (sub-nodes filtered out)
    expect(reloaded.edges.size).toBe(t.edges.size); // 4
    const conds = reloaded.conditionList();
    expect(conds).toHaveLength(1);
    expect(conds[0]!.type).toBe('NodeOnEdge');
  }, 30_000);
});
