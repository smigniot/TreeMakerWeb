// Selection model: a set of part references (kind + id). Mirrors the role of
// the C++ tmCluster mSelection shared between canvas and inspector.

export type PartKind = 'node' | 'edge' | 'path' | 'condition';

export interface PartRef {
  kind: PartKind;
  id: number;
}

const key = (r: PartRef): string => `${r.kind}:${r.id}`;

export class Selection {
  private items = new Map<string, PartRef>();
  private listeners = new Set<() => void>();

  get size(): number { return this.items.size; }

  has(r: PartRef): boolean { return this.items.has(key(r)); }

  list(): PartRef[] { return [...this.items.values()]; }

  /** The single selected ref, or null if zero or many. */
  single(): PartRef | null {
    return this.items.size === 1 ? this.items.values().next().value! : null;
  }

  nodes(): number[] {
    return this.list().filter((r) => r.kind === 'node').map((r) => r.id);
  }

  set(r: PartRef): void {
    this.items.clear();
    this.items.set(key(r), r);
    this.notify();
  }

  toggle(r: PartRef): void {
    const k = key(r);
    if (this.items.has(k)) this.items.delete(k);
    else this.items.set(k, r);
    this.notify();
  }

  clear(): void {
    if (this.items.size === 0) return;
    this.items.clear();
    this.notify();
  }

  /** Drop refs that no longer exist (e.g. after a delete). */
  prune(exists: (r: PartRef) => boolean): void {
    let changed = false;
    for (const [k, r] of this.items) {
      if (!exists(r)) { this.items.delete(k); changed = true; }
    }
    if (changed) this.notify();
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify(): void {
    for (const fn of this.listeners) fn();
  }
}
