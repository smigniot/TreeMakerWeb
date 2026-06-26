// Native file format: JSON. This is the source of truth for save/load and for
// undo snapshots — chosen for debuggability; the schema mirrors the model's
// authoritative state 1:1 (see Tree.toState / Tree.fromState). Legacy TreeMaker
// .tm/.tmd5 files are handled separately under io/legacy/ (import + export only).

import { Tree } from '../model/tree';
import type { TreeState } from '../model/tree';

/** Serialize a tree to the native JSON string. */
export function treeToJson(tree: Tree, pretty = true): string {
  return JSON.stringify(tree.toState(), null, pretty ? 2 : 0);
}

/** Parse a native JSON string into a new Tree. Throws on malformed input. */
export function treeFromJson(text: string): Tree {
  const state = JSON.parse(text) as TreeState;
  validateState(state);
  return Tree.fromState(state);
}

function validateState(s: unknown): asserts s is TreeState {
  if (typeof s !== 'object' || s === null) throw new Error('invalid tree JSON: not an object');
  const o = s as Record<string, unknown>;
  if (o['format'] !== 1) throw new Error(`unsupported tree JSON format: ${String(o['format'])}`);
  if (!Array.isArray(o['nodes']) || !Array.isArray(o['edges'])) {
    throw new Error('invalid tree JSON: missing nodes/edges');
  }
}
