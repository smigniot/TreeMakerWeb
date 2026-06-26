// Snapshot-based undo/redo, mirroring the C++ approach (each command serializes
// the whole tree). Cheap and robust at P1 sizes; granularity is one entry per
// discrete user edit (DesignView.onEdit / inspector apply / menu command).

import type { Tree, TreeState } from '../model/tree';

export class UndoManager {
  private past: { label: string; state: TreeState }[] = [];
  private future: { label: string; state: TreeState }[] = [];
  private current: TreeState;
  private listeners = new Set<() => void>();

  constructor(private tree: Tree) {
    this.current = tree.toState();
  }

  /** Record the tree's post-edit state as a new undo entry. */
  record(label: string): void {
    this.past.push({ label, state: this.current });
    this.current = this.tree.toState();
    this.future = [];
    this.notify();
  }

  /** Reset history to the current tree state (e.g. after New/Open). */
  reset(): void {
    this.past = [];
    this.future = [];
    this.current = this.tree.toState();
    this.notify();
  }

  get canUndo(): boolean { return this.past.length > 0; }
  get canRedo(): boolean { return this.future.length > 0; }
  get undoLabel(): string | null { return this.past.at(-1)?.label ?? null; }
  get redoLabel(): string | null { return this.future[0]?.label ?? null; }

  undo(): void {
    const entry = this.past.pop();
    if (!entry) return;
    this.future.unshift({ label: entry.label, state: this.current });
    this.current = entry.state;
    this.tree.loadState(this.current);
    this.notify();
  }

  redo(): void {
    const entry = this.future.shift();
    if (!entry) return;
    this.past.push({ label: entry.label, state: this.current });
    this.current = entry.state;
    this.tree.loadState(this.current);
    this.notify();
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify(): void {
    for (const fn of this.listeners) fn();
  }
}
