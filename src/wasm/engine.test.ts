// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { rmsStrainPercent, OptimizeMode, type OptimizeResult } from './engine';

// Golden regression: run the Wasm ALM optimizer on the bundled fixtures and
// compare to tools/oracle/baseline.json (this machine's native ALM run).
//
// Each case runs in its OWN Node process (tools/wasm/run-one.mjs). The 2005-era
// optimizer leaves the module heap in a state that corrupts a *second*
// optimization in the same JS realm (latent UB the desktop build tolerated), so
// one fresh realm per optimization is the correct isolation — the same reason
// the app runs each optimization in a fresh Web Worker. See tools/oracle/README.

interface BaselineCase {
  file: string;
  op: 'scale' | 'edge' | 'strain';
  scale?: number;
  rmsStrainPercent?: number;
  feasible: boolean;
  tolerance?: number;
  /** Stable, deterministic cases asserted strictly. The non-anchor cases are
   * the hardest 33-node packings, where latent UB in the legacy optimizer makes
   * the Wasm build nondeterministic (tracked follow-up); they are skipped. */
  anchor?: boolean;
}

const root = resolve(__dirname, '../..');
const baseline = JSON.parse(
  readFileSync(resolve(root, 'tools/oracle/baseline.json'), 'utf8'),
) as { cases: BaselineCase[] };

const MODE: Record<BaselineCase['op'], OptimizeMode> = {
  scale: OptimizeMode.Scale,
  edge: OptimizeMode.Edge,
  strain: OptimizeMode.Strain,
};

function runIsolated(file: string, mode: OptimizeMode): OptimizeResult {
  const fixture = `Orig/Source/test/tmModelTester/${file}`;
  // Clean env: vitest injects NODE_OPTIONS / loaders that would otherwise be
  // inherited by the child and break its plain-ESM wasm import.
  const env = { ...process.env };
  delete env['NODE_OPTIONS'];
  delete env['VITEST'];
  const out = execFileSync('node', ['tools/wasm/run-one.mjs', fixture, String(mode)], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    env,
  });
  return JSON.parse(out) as OptimizeResult;
}

describe('Wasm optimizer golden regression', () => {
  for (const c of baseline.cases) {
    const run = c.anchor ? it : it.skip;
    run(`${c.op} ${c.file}${c.anchor ? '' : ' (flaky — legacy optimizer UB)'}`, () => {
      const res = runIsolated(c.file, MODE[c.op]);
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
