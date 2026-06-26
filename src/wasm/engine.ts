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

// --- crease pattern ---

/** Crease structural kind (the AGRH assignment). */
export const enum CreaseKind {
  Axial = 0, Gusset = 1, Ridge = 2,
  UnfoldedHinge = 3, FoldedHinge = 4, Pseudohinge = 5,
}

/** Mountain/valley assignment. */
export const enum CreaseFold {
  Flat = 0, Mountain = 1, Valley = 2, Border = 3,
}

/** CPStatus enum (0 = full crease pattern; others are the failure stage). */
export const enum CPStatus {
  HasFullCP = 0,
  EdgesTooShort = 1,
  PolysNotValid = 2,
  PolysNotFilled = 3,
  PolysMultipleIBPs = 4,
  VerticesLackDepth = 5,
  FacetsNotValid = 6,
  NotLocalRootConnectable = 7,
}

export interface CreasePatternResult {
  ok: boolean;
  error?: string;
  status: number;
  /** Optimized scale + node positions (in spec order), present for specBuildCP. */
  scale?: number;
  feasible?: boolean;
  nodes?: { i: number; x: number; y: number }[];
  vertices: { i: number; x: number; y: number }[];
  /** a,b = vertex indices; k = CreaseKind; f = CreaseFold. */
  creases: { i: number; a: number; b: number; k: number; f: number }[];
  /** o = layer order; vs = CCW vertex indices. */
  facets: { i: number; o: number; vs: number[] }[];
}

/** Build the full crease pattern from a (packed) TreeMaker document. */
export async function buildCreasePattern(docText: string): Promise<CreasePatternResult> {
  const M = await getModule();
  const ptr = M.ccall('tmBuildCreasePattern', 'number', ['string'], [docText]);
  const json = M.UTF8ToString(ptr);
  M._free(ptr);
  return JSON.parse(json) as CreasePatternResult;
}

/**
 * Build a tree from the authoritative spec (see io/spec.ts), optimize it, and
 * build the crease pattern — all natively in C++. Returns the CP geometry plus
 * the optimized scale and node positions (in spec order).
 */
export async function specBuildCreasePattern(spec: string, mode: OptimizeMode): Promise<CreasePatternResult> {
  const M = await getModule();
  const ptr = M.ccall('tmSpecBuildCP', 'number', ['string', 'number'], [spec, mode]);
  const json = M.UTF8ToString(ptr);
  M._free(ptr);
  return JSON.parse(json) as CreasePatternResult;
}

/** Stiffness-weighted RMS strain as a percentage (matches the tester's metric). */
export function rmsStrainPercent(edges: OptimizeResult['edges']): number {
  if (!edges.length) return 0;
  let ss = 0;
  for (const e of edges) ss += e.stiffness * e.strain * e.strain;
  return 100 * Math.sqrt(ss / edges.length);
}

