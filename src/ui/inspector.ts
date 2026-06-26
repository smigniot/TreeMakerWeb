// Context-sensitive property editor for the current selection. Mirrors the C++
// tmwxInspector: empty → Tree panel; one part → that part's panel; many → a
// group summary. Edits apply immediately and report an undo label.

import type { Tree } from '../model/tree';
import type { Selection } from '../view/selection';
import { row, numberInput, textInput, checkbox, readonlyField, heading } from './forms';

export class Inspector {
  private disposers: Array<() => void> = [];

  constructor(
    private host: HTMLElement,
    private tree: Tree,
    private selection: Selection,
    private onEdit: (label: string) => void,
  ) {
    this.disposers.push(this.tree.onChange(() => this.render()));
    this.disposers.push(this.selection.onChange(() => this.render()));
    this.render();
  }

  dispose(): void {
    for (const d of this.disposers) d();
  }

  /** Apply a mutation and record it for undo. */
  private apply(label: string, fn: () => void): void {
    this.tree.edit(fn);
    this.onEdit(label);
  }

  render(): void {
    this.host.replaceChildren();
    const refs = this.selection.list();
    if (refs.length === 0) return this.renderTree();
    if (refs.length === 1) {
      const r = refs[0]!;
      if (r.kind === 'node') return this.renderNode(r.id);
      if (r.kind === 'edge') return this.renderEdge(r.id);
      if (r.kind === 'condition') return this.renderCondition(r.id);
    }
    return this.renderGroup();
  }

  private renderTree(): void {
    const t = this.tree;
    this.host.append(heading('Tree'));
    this.host.append(
      row('Paper W', numberInput(t.paper.width, (v) => this.apply('Set paper', () => t.setPaper(v, t.paper.height)), { step: 0.1 })),
      row('Paper H', numberInput(t.paper.height, (v) => this.apply('Set paper', () => t.setPaper(t.paper.width, v)), { step: 0.1 })),
      row('Scale', numberInput(t.scale, (v) => this.apply('Set scale', () => t.setScale(v)), { step: 0.01 })),
      row('Symmetry', checkbox(t.symmetry.has, (v) => this.apply('Set symmetry', () => t.setSymmetry({ has: v })))),
    );
    if (t.symmetry.has) {
      this.host.append(
        row('Sym X', numberInput(t.symmetry.loc.x, (v) => this.apply('Set symmetry', () => t.setSymmetry({ loc: { x: v, y: t.symmetry.loc.y } })), { step: 0.05 })),
        row('Sym Y', numberInput(t.symmetry.loc.y, (v) => this.apply('Set symmetry', () => t.setSymmetry({ loc: { x: t.symmetry.loc.x, y: v } })), { step: 0.05 })),
        row('Sym °', numberInput(t.symmetry.angle, (v) => this.apply('Set symmetry', () => t.setSymmetry({ angle: v })), { step: 5 })),
      );
    }
  }

  private renderNode(id: number): void {
    const n = this.tree.getNode(id);
    if (!n) return this.renderTree();
    this.host.append(heading(`Node ${id}`));
    this.host.append(
      row('X', numberInput(n.loc.x, (v) => this.apply('Edit node', () => this.tree.moveNode(id, { x: v, y: n.loc.y })), { step: 0.01 })),
      row('Y', numberInput(n.loc.y, (v) => this.apply('Edit node', () => this.tree.moveNode(id, { x: n.loc.x, y: v })), { step: 0.01 })),
      row('Label', textInput(n.label, (v) => this.apply('Edit node', () => this.tree.setNodeLabel(id, v)))),
      row('Leaf', readonlyField(n.isLeaf ? 'yes' : 'no')),
      row('Sub', readonlyField(n.isSub ? 'yes' : 'no')),
    );
  }

  private renderEdge(id: number): void {
    const e = this.tree.getEdge(id);
    if (!e) return this.renderTree();
    this.host.append(heading(`Edge ${id}`));
    this.host.append(
      row('Length', numberInput(e.length, (v) => this.apply('Edit edge', () => this.tree.setEdgeProps(id, { length: v })), { step: 0.1 })),
      row('Strain', numberInput(e.strain, (v) => this.apply('Edit edge', () => this.tree.setEdgeProps(id, { strain: v })), { step: 0.01 })),
      row('Stiffness', numberInput(e.stiffness, (v) => this.apply('Edit edge', () => this.tree.setEdgeProps(id, { stiffness: v })), { step: 0.1 })),
      row('Label', textInput(e.label, (v) => this.apply('Edit edge', () => this.tree.setEdgeProps(id, { label: v })))),
    );
  }

  private renderCondition(id: number): void {
    const c = this.tree.conditions.get(id);
    if (!c) return this.renderTree();
    this.host.append(heading(`Condition ${id}`));
    const feas = this.tree.conditionFeasible(c);
    this.host.append(
      row('Type', readonlyField(c.type)),
      row('Tag', readonlyField(c.tag)),
      row('Feasible', readonlyField(feas === undefined ? '—' : feas ? 'yes' : 'no')),
    );
  }

  private renderGroup(): void {
    const refs = this.selection.list();
    const counts = new Map<string, number>();
    for (const r of refs) counts.set(r.kind, (counts.get(r.kind) ?? 0) + 1);
    this.host.append(heading(`${refs.length} selected`));
    for (const [kind, n] of counts) this.host.append(row(kind, readonlyField(String(n))));
  }
}
