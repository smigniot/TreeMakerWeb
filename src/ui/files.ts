// File open/save for the browser. Native format is JSON; legacy .tmd5/.tm files
// are detected and imported. Save always writes native JSON.

import { Tree } from '../model/tree';
import { treeToJson, treeFromJson } from '../io/json';
import { importLegacy, looksLikeLegacy } from '../io/legacy';

/** Parse a file's text into a Tree, auto-detecting legacy vs native JSON. */
export function parseDocument(text: string): Tree {
  return looksLikeLegacy(text) ? importLegacy(text) : treeFromJson(text);
}

/** Prompt the user to pick a file and return its parsed Tree. */
export function openFileDialog(): Promise<Tree | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.tmd5,.tmd,.tm,application/json,text/plain';
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      try {
        resolve(parseDocument(await file.text()));
      } catch (err) {
        alert(`Could not open file:\n${(err as Error).message}`);
        resolve(null);
      }
    });
    input.click();
  });
}

/** Trigger a download of the tree as native JSON. */
export function saveJson(tree: Tree, filename = 'design.json'): void {
  const blob = new Blob([treeToJson(tree)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
