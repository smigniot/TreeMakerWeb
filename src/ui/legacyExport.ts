// Export the live tree to legacy TreeMaker 5.0 text, so desktop TreeMaker can
// open files saved from the web port. The tree is rebuilt natively in C++ from
// its authoritative spec and serialized via PutSelf; mode -1 means "do not
// re-optimize" — the node positions are already the user's design.

import type { Tree } from '../model/tree';
import { writeSpec } from '../io/spec';
import { exportV5 } from '../wasm/workerClient';

export function exportTreeV5(tree: Tree): Promise<string> {
  return exportV5(writeSpec(tree), -1);
}
