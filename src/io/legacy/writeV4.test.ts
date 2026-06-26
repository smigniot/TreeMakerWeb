// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { importLegacy } from './index';
import { writeV4 } from './writeV4';
import { optimize, OptimizeMode } from '../../wasm/engine';

const fixture = (name: string): string =>
  readFileSync(resolve(__dirname, '../../../Orig/Source/test/tmModelTester', name), 'latin1');

describe('legacy v4 export', () => {
  it('round-trips through TS (import → export → import)', () => {
    const a = importLegacy(fixture('tmModelTester_1.tmd5'));
    const text = writeV4(a);
    const b = importLegacy(text);
    expect(b.nodes.size).toBe(a.nodes.size);
    expect(b.edges.size).toBe(a.edges.size);
    // node positions preserved (to v4's 6-digit precision)
    for (const n of a.nodeList()) {
      const m = b.getNode(n.id)!;
      expect(m.loc.x).toBeCloseTo(n.loc.x, 5);
      expect(m.loc.y).toBeCloseTo(n.loc.y, 5);
    }
  });

  it('exported tree optimizes to the same scale as the original (Wasm)', async () => {
    const tree = importLegacy(fixture('tmModelTester_1.tmd5'));
    const res = await optimize(writeV4(tree), OptimizeMode.Scale);
    expect(res.ok).toBe(true);
    expect(res.scale).toBeCloseTo(0.517637, 4); // matches optimizing the original
  }, 30_000);
});
