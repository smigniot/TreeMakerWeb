// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { Tree } from '../model/tree';
import { pt } from '../model/geometry';
import { buildTreeCreasePattern, CPStatus, CreaseFold } from '../ui/creasePattern';

/** A symmetric 4-flap "star": center node + 4 unit-length leaf edges. */
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

describe('crease-pattern build (native spec builder)', () => {
  it('builds a full crease pattern for a 4-flap base', async () => {
    const cp = await buildTreeCreasePattern(fourFlapStar());
    expect(cp.ok).toBe(true);
    expect(cp.status).toBe(CPStatus.HasFullCP); // 0
    expect(cp.scale).toBeGreaterThan(0.3);
    expect(cp.vertices.length).toBeGreaterThan(0);
    expect(cp.creases.length).toBeGreaterThan(0);
    expect(cp.facets.length).toBeGreaterThan(0);

    // crease endpoints reference real vertices
    const vids = new Set(cp.vertices.map((v) => v.i));
    for (const c of cp.creases) {
      expect(vids.has(c.a)).toBe(true);
      expect(vids.has(c.b)).toBe(true);
    }
    // both mountain and valley folds are assigned
    const folds = new Set(cp.creases.map((c) => c.f));
    expect(folds.has(CreaseFold.Mountain)).toBe(true);
    expect(folds.has(CreaseFold.Valley)).toBe(true);
  }, 30_000);

  it('applies a NodeFixed condition during the optimization', async () => {
    const t = fourFlapStar();
    // The first leaf is node index 1 (center is 0); pin it to mid bottom-edge.
    const leaf = t.nodeList()[1]!;
    t.addCondition({
      type: 'NodeFixed', tag: 'CNfn', node: leaf.id,
      xFixed: true, yFixed: true, xFixValue: 0.5, yFixValue: 0,
    });

    const cp = await buildTreeCreasePattern(t);
    expect(cp.ok).toBe(true);
    const pinned = cp.nodes?.find((n) => n.i === 1);
    expect(pinned).toBeTruthy();
    // The optimizer respected the fix: the node is at (0.5, 0).
    expect(pinned!.x).toBeCloseTo(0.5, 3);
    expect(pinned!.y).toBeCloseTo(0, 3);
  }, 30_000);
});
