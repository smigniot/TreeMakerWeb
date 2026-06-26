// Legacy TreeMaker file import (.tm / .tmd5). These are the original positional
// ASCII formats (versions 3.0 / 4.0 / 5.0). They are import/export only — the
// native format is JSON (see ../json.ts).
//
// P1 implements v4.0 import (the format of all bundled test fixtures and TM4
// files). v5.0 (full crease pattern) and v3.0 import, and legacy export, are
// tracked follow-ups; until then they throw an actionable error rather than
// silently mis-parsing.

import { Cursor } from './cursor';
import { readV4 } from './readV4';
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
      throw new UnsupportedVersionError(
        'TreeMaker 5.0 import is not implemented yet (P1 supports 4.0). ' +
        'Open it in desktop TreeMaker and "Export v4", or wait for v5 support.',
      );
    case '3.0':
      throw new UnsupportedVersionError('TreeMaker 3.0 import is not implemented yet (P1 supports 4.0).');
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
