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
});
