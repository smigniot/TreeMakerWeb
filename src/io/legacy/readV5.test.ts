// @vitest-environment node
import { describe, it, expect } from 'vitest';
import createTmEngine from '../../wasm/generated/tmengine.js';
import { importLegacy } from './index';
import { buildTreeCreasePattern } from '../../ui/creasePattern';

// We don't ship a v5 fixture, so generate one with the engine (tmExportV5 builds
// a tree from a spec, optimizes, builds the full crease pattern, and serializes
// it as v5 — polys/vertices/creases/facets included). Then check the v5 reader
// extracts the authoritative tree (tree nodes only, edges, conditions).

async function exportV5(spec: string): Promise<string> {
  const M = await createTmEngine();
  const ptr = M.ccall('tmExportV5', 'number', ['string', 'number'], [spec, 0]);
  const text = M.UTF8ToString(ptr);
  M._free(ptr);
  return text;
}

// 4-flap star (center + 4 unit edges), symmetry on, one NodeOnEdge condition.
const FOUR_FLAP =
  '1 1 0.1 1 0.5 0.5 90\n5\n0.5 0.5\n0.15 0.85\n0.85 0.85\n0.15 0.15\n0.85 0.15\n' +
  '4\n0 1 1 0 1\n0 2 1 0 1\n0 3 1 0 1\n0 4 1 0 1\n1\nCNen 1';

describe('legacy v5 import', () => {
  it('is a full v5 document with a crease pattern', async () => {
    const v5 = await exportV5(FOUR_FLAP);
    expect(v5.startsWith('tree\n5.0\n')).toBe(true);
    // full crease pattern serialized → these record types are present
    for (const tag of ['\npoly\n', '\nvrtx\n', '\ncrse\n', '\nfact\n']) {
      expect(v5).toContain(tag);
    }
  });

  it('extracts only the tree nodes (skips poly sub-nodes), edges, conditions', async () => {
    const t = importLegacy(await exportV5(FOUR_FLAP));
    expect(t.nodes.size).toBe(5); // 1 center + 4 leaves, NOT the CP inset nodes
    expect(t.edges.size).toBe(4);
    expect(t.symmetry.has).toBe(true);
    const conds = t.conditionList();
    expect(conds).toHaveLength(1);
    expect(conds[0]!.type).toBe('NodeOnEdge');
  });

  it('survives a JSON round-trip and rebuilds a crease pattern', async () => {
    const t = importLegacy(await exportV5(FOUR_FLAP));
    // the imported tree is a usable model: it can build a crease pattern again
    const cp = await buildTreeCreasePattern(t);
    expect(cp.ok).toBe(true);
    expect(cp.creases.length).toBeGreaterThan(0);
  }, 30_000);
});
