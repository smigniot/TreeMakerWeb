// Context-sensitive property editor for the current selection. Mirrors the C++
// tmwxInspector: empty → Tree panel; one part → that part's panel; many → a
// group summary. Edits apply immediately and report an undo label.

import type { Tree } from '../model/tree';
import type { NewCondition } from '../model/conditions';
import type { Selection } from '../view/selection';
import { row, numberInput, textInput, checkbox, readonlyField, heading, subheading, actionButton, buttonGroup } from './forms';

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

  private addCond(c: NewCondition): void {
    this.apply('Add condition', () => this.tree.addCondition(c));
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

    // All conditions, with remove buttons. (Create them by selecting nodes/edges.)
    const conds = this.tree.conditionList();
    this.host.append(subheading(`Conditions (${conds.length})`));
    if (conds.length === 0) {
      const hint = readonlyField('Select a node or edge to add conditions.');
      hint.style.color = '#888';
      this.host.append(row('', hint));
    }
    for (const c of conds) {
      const feas = this.tree.conditionFeasible(c);
      const label = readonlyField(`${c.type}${feas === false ? ' ✗' : ''}`);
      if (feas === false) label.style.color = 'var(--tm-infeasible)';
      const rm = actionButton('✕', () => this.apply('Remove condition', () => this.tree.removeCondition(c.id)), 'Remove');
      this.host.append(row(`#${c.id}`, buttonGroup([label, rm])));
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

    this.host.append(subheading('Add condition'));
    this.host.append(buttonGroup([
      actionButton('Stick to edge', () => this.addCond({ type: 'NodeOnEdge', tag: 'CNen', node: id }), 'Node must lie on a paper edge'),
      actionButton('Stick to corner', () => this.addCond({ type: 'NodeOnCorner', tag: 'CNkn', node: id }), 'Node must lie on a paper corner'),
      actionButton('On symmetry line', () => this.addCond({ type: 'NodeSymmetric', tag: 'CNsn', node: id }), 'Node must lie on the symmetry line (enable symmetry in the Tree panel)'),
      actionButton('Fix here', () => this.addCond({ type: 'NodeFixed', tag: 'CNfn', node: id, xFixed: true, yFixed: true, xFixValue: n.loc.x, yFixValue: n.loc.y }), 'Fix the node at its current position'),
    ]));
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

    this.host.append(subheading('Add condition'));
    this.host.append(buttonGroup([
      actionButton('Length fixed', () => this.addCond({ type: 'EdgeLengthFixed', tag: 'CNfe', edge: id }), 'Edge strain forced to zero'),
    ]));
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
    this.host.append(buttonGroup([
      actionButton('Remove', () => this.apply('Remove condition', () => this.tree.removeCondition(id))),
    ]));
  }

  private renderGroup(): void {
    const refs = this.selection.list();
    const nodeIds = refs.filter((r) => r.kind === 'node').map((r) => r.id);
    const edgeIds = refs.filter((r) => r.kind === 'edge').map((r) => r.id);
    this.host.append(heading(`${refs.length} selected`));
    this.host.append(row('nodes', readonlyField(String(nodeIds.length))));
    this.host.append(row('edges', readonlyField(String(edgeIds.length))));

    const buttons: HTMLElement[] = [];
    if (nodeIds.length === 2) {
      const [a, b] = nodeIds as [number, number];
      buttons.push(
        actionButton('Paired', () => this.addCond({ type: 'NodesPaired', tag: 'CNpn', node1: a, node2: b }), 'Mirror the two nodes across the symmetry line'),
        actionButton('Path active', () => this.addCond({ type: 'PathActive', tag: 'CNap', node1: a, node2: b }), 'Make the path between the two leaf nodes taut'),
        actionButton('Path angle…', () => {
          const ang = Number(window.prompt('Path angle (degrees):', '0'));
          if (Number.isFinite(ang)) this.addCond({ type: 'PathAngleFixed', tag: 'CNfp', node1: a, node2: b, angle: ang });
        }, 'Active path at a fixed angle'),
        actionButton('Path angle quant…', () => {
          const q = Number(window.prompt('Quantization N (e.g. 2, 4, 8):', '4'));
          if (Number.isInteger(q) && q >= 1) this.addCond({ type: 'PathAngleQuant', tag: 'CNqp', node1: a, node2: b, quant: q, quantOffset: 0 });
        }, 'Active path at a quantized angle (180°/N steps)'),
      );
    }
    if (nodeIds.length === 3) {
      const [a, b, c] = nodeIds as [number, number, number];
      buttons.push(actionButton('Collinear', () => this.addCond({ type: 'NodesCollinear', tag: 'CNcn', node1: a, node2: b, node3: c }), 'The three nodes must be collinear'));
    }
    if (edgeIds.length === 2) {
      const [a, b] = edgeIds as [number, number];
      buttons.push(actionButton('Same strain', () => this.addCond({ type: 'EdgesSameStrain', tag: 'CNes', edge1: a, edge2: b }), 'The two edges must have equal strain'));
    }
    if (buttons.length) {
      this.host.append(subheading('Add condition'));
      this.host.append(buttonGroup(buttons));
    } else {
      this.host.append(subheading('Add condition'));
      const hint = readonlyField('Select 2–3 nodes or 2 edges.');
      hint.style.color = '#888';
      this.host.append(row('', hint));
    }
  }
}
