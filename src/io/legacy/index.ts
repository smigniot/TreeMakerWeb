// Legacy TreeMaker file import (.tm / .tmd5). These are the original positional
// ASCII formats; the native format is JSON (see ../json.ts).
//
// Supported: v4.0 (TM4 / the bundled fixtures) and v5.0 (the format desktop
// TreeMaker 5 saves — full crease pattern; we extract the authoritative tree and
// regenerate the rest). v5 *export* lives in ui/legacyExport.ts (via the C++
// PutSelf). v3.0 import is a tracked follow-up.

import { Cursor } from './cursor';
import { readV4 } from './readV4';
import { readV5 } from './readV5';
import { Tree } from '../../model/tree';
import type { TreeState } from '../../model/tree';

export class UnsupportedVersionError extends Error {}

/** Parse legacy text into a TreeState (no Tree construction). */
export function parseLegacy(text: string): TreeState {
  const c = new Cursor(text);
  const tag = c.str();
  if (tag !== 'tree') throw new Error(`not a TreeMaker file: leading tag is "${tag}"`);
  const version = c.str().trim();
  switch (version) {
    case '4.0':
      return readV4(c);
    case '5.0':
      return readV5(c);
    case '3.0':
      throw new UnsupportedVersionError('TreeMaker 3.0 import is not implemented yet (supports 4.0 and 5.0).');
    default:
      throw new UnsupportedVersionError(`unknown TreeMaker file version "${version}"`);
  }
}

/** Import a legacy file into a live Tree. */
export function importLegacy(text: string): Tree {
  return Tree.fromState(parseLegacy(text));
}

/** Quick check used by the open dialog to route .tmd5 vs .json. */
export function looksLikeLegacy(text: string): boolean {
  return /^\s*tree\b/.test(text);
}
