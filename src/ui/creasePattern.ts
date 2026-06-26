// Bridge from the live tree to the WebAssembly crease-pattern builder. The tree
// is rebuilt natively in C++ from its authoritative data (see io/spec.ts), then
// optimized and turned into a crease pattern — avoiding any hand-serialization
// of the densely cross-linked derived structure.

import type { Tree } from '../model/tree';
import { writeSpec } from '../io/spec';
import { specBuildCreasePattern, OptimizeMode, type CreasePatternResult } from '../wasm/engine';

export type { CreasePatternResult };
export { CPStatus, CreaseKind, CreaseFold, OptimizeMode } from '../wasm/engine';

/** Optimize the tree (default: scale packing) and build its crease pattern. */
export async function buildTreeCreasePattern(
  tree: Tree,
  mode: OptimizeMode = OptimizeMode.Scale,
): Promise<CreasePatternResult> {
  return specBuildCreasePattern(writeSpec(tree), mode);
}

/** Human-readable explanation of a CPStatus. */
export function cpStatusMessage(status: number): string {
  switch (status) {
    case 0: return 'full crease pattern';
    case 1: return 'edges too short';
    case 2: return 'polygons not valid';
    case 3: return 'polygons not filled';
    case 4: return 'polygon has multiple inset boundary paths';
    case 5: return 'vertices lack depth';
    case 6: return 'facets not valid';
    case 7: return 'not local-root connectable';
    default: return 'build failed';
  }
}
