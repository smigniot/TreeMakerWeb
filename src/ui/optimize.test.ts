// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { Tree } from '../model/tree';
import { pt } from '../model/geometry';
import { optimizeTree, OptimizeMode } from './optimize';

function fourFlapStar(): Tree {
  const t = new Tree();
  t.edit(() => {
    const c = t.addNode(pt(0.5, 0.5));
    t.addNodeFrom(c.id, pt(0.15, 0.85));
    t.addNodeFrom(c.id, pt(0.85, 0.85));
    t.addNodeFrom(c.id, pt(0.15, 0.15));
    t.addNodeFrom(c.id, pt(0.85, 0.15));
  });
  return t;
}

describe('optimizeTree (Scale Everything path, via writeV4)', () => {
  it('packs the tree and reports a larger scale', async () => {
    const t = fourFlapStar();
    const res = await optimizeTree(t, OptimizeMode.Scale);
    expect(res.ok).toBe(true);
    expect(res.scale).toBeGreaterThan(0.2);
  }, 30_000);

  it('honors a NodeFixed condition (all 11 condition types serialize to v4)', async () => {
    const t = fourFlapStar();
    const leaf = t.nodeList()[1]!; // the (0.15, 0.85) leaf
    t.addCondition({
      type: 'NodeFixed', tag: 'CNfn', node: leaf.id,
      xFixed: true, yFixed: true, xFixValue: 0.3, yFixValue: 0.3,
    });
    await optimizeTree(t, OptimizeMode.Scale);
    const n = t.getNode(leaf.id)!;
    expect(n.loc.x).toBeCloseTo(0.3, 2);
    expect(n.loc.y).toBeCloseTo(0.3, 2);
  }, 30_000);
});
