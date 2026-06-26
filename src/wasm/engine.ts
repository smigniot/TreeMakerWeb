// Typed wrapper around the WebAssembly optimizer (tmengine). Loads the module
// lazily and exposes a single async optimize() call. Used directly in tests and
// behind a Web Worker in the app.

import createTmEngine, { type TmEngineModule } from './generated/tmengine.js';

export const enum OptimizeMode {
  Scale = 0, // circle/river packing — maximize scale
  Edge = 1, // uniform edge-strain maximization
  Strain = 2, // minimize stiffness-weighted strain
}

export interface OptimizeResult {
  ok: boolean;
  error?: string;
  scale: number;
  feasible: boolean;
  nodes: { i: number; x: number; y: number }[];
  edges: { i: number; strain: number; stiffness: number }[];
}

let modulePromise: Promise<TmEngineModule> | null = null;
function getModule(): Promise<TmEngineModule> {
  return (modulePromise ??= createTmEngine());
}

/**
 * Run one optimization pass on a TreeMaker document (v4/v5 text). The module is
 * instantiated once and reused — safe now that the Wasm stack is sized for the
 * optimizer's large-tree working set (see tools/wasm/build.sh -sSTACK_SIZE).
 */
export async function optimize(docText: string, mode: OptimizeMode): Promise<OptimizeResult> {
  const M = await getModule();
  const ptr = M.ccall('tmOptimize', 'number', ['string', 'number'], [docText, mode]);
  const json = M.UTF8ToString(ptr);
  M._free(ptr);
  return JSON.parse(json) as OptimizeResult;
}

/** Stiffness-weighted RMS strain as a percentage (matches the tester's metric). */
export function rmsStrainPercent(edges: OptimizeResult['edges']): number {
  if (!edges.length) return 0;
  let ss = 0;
  for (const e of edges) ss += e.stiffness * e.strain * e.strain;
  return 100 * Math.sqrt(ss / edges.length);
}
