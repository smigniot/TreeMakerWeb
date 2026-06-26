// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { optimize, rmsStrainPercent, OptimizeMode, type OptimizeResult } from './engine';

// Golden regression: run the Wasm ALM optimizer on the bundled fixtures and
// compare to tools/oracle/baseline.json. With a correctly-sized Wasm stack the
// -O2 build is deterministic and reproduces the original 2005 values to ~6
// digits, including the 33-node packings, all from one reused module instance.

interface BaselineCase {
  file: string;
  op: 'scale' | 'edge' | 'strain';
  scale?: number;
  rmsStrainPercent?: number;
  feasible: boolean;
  tolerance?: number;
}

const root = resolve(__dirname, '../..');
const baseline = JSON.parse(
  readFileSync(resolve(root, 'tools/oracle/baseline.json'), 'utf8'),
) as { cases: BaselineCase[] };

const fixture = (name: string): string =>
  readFileSync(resolve(root, 'Orig/Source/test/tmModelTester', name), 'latin1');

const MODE: Record<BaselineCase['op'], OptimizeMode> = {
  scale: OptimizeMode.Scale,
  edge: OptimizeMode.Edge,
  strain: OptimizeMode.Strain,
};

describe('Wasm optimizer golden regression', () => {
  for (const c of baseline.cases) {
    it(`${c.op} ${c.file}`, async () => {
      const res: OptimizeResult = await optimize(fixture(c.file), MODE[c.op]);
      expect(res.ok).toBe(true);
      expect(res.feasible).toBe(c.feasible);
      if (c.scale !== undefined) {
        expect(Math.abs(res.scale - c.scale)).toBeLessThanOrEqual(c.tolerance ?? 1e-3);
      }
      if (c.rmsStrainPercent !== undefined) {
        const rms = rmsStrainPercent(res.edges);
        expect(Math.abs(rms - c.rmsStrainPercent)).toBeLessThanOrEqual(c.tolerance ?? 1e-2);
      }
    }, 30_000);
  }
});
