import { describe, it, expect } from 'vitest';
import { Tree } from './tree';
import { pt } from './geometry';

describe('Tree topology + cleanup', () => {
  it('first node becomes the root and a (degenerate) leaf', () => {
    const t = new Tree();
    const n = t.addNode(pt(0.5, 0.5));
    expect(t.rootNode).toBe(n.id);
    expect(t.nodes.size).toBe(1);
    // single node, no edges → no leaf paths
    expect(t.pathList()).toHaveLength(0);
  });

  it('addNodeFrom builds an edge and a leaf path between the two leaves', () => {
    const t = new Tree();
    t.setScale(0.1);
    const a = t.addNode(pt(0.2, 0.5));
    const { node: b } = t.addNodeFrom(a.id, pt(0.8, 0.5));
    expect(t.edges.size).toBe(1);
    expect(t.getNode(a.id)!.isLeaf).toBe(true);
    expect(t.getNode(b.id)!.isLeaf).toBe(true);
    const paths = t.pathList();
    expect(paths).toHaveLength(1);
    const p = paths[0]!;
    expect(p.isLeafPath).toBe(true);
    expect(p.minTreeLength).toBeCloseTo(1);
    expect(p.minPaperLength).toBeCloseTo(0.1); // scale * length
    expect(p.actPaperLength).toBeCloseTo(0.6);
    expect(p.isFeasible).toBe(true); // 0.6 >= 0.1
  });

  it('infeasible when nodes are closer than scaled length', () => {
    const t = new Tree();
    t.setScale(1.0); // min paper length = 1.0 for a unit edge
    const a = t.addNode(pt(0.4, 0.5));
    t.addNodeFrom(a.id, pt(0.6, 0.5)); // only 0.2 apart
    expect(t.isFeasible).toBe(false);
    expect(t.pathList()[0]!.isFeasible).toBe(false);
  });

  it('interior node of a 3-node chain is not a leaf', () => {
    const t = new Tree();
    const a = t.addNode(pt(0.1, 0.5));
    const { node: mid } = t.addNodeFrom(a.id, pt(0.5, 0.5));
    const { node: c } = t.addNodeFrom(mid.id, pt(0.9, 0.5));
    expect(t.getNode(mid.id)!.isLeaf).toBe(false);
    expect(t.getNode(a.id)!.isLeaf).toBe(true);
    expect(t.getNode(c.id)!.isLeaf).toBe(true);
    // one leaf path a..c through mid, length 2
    const paths = t.pathList();
    expect(paths).toHaveLength(1);
    expect(paths[0]!.minTreeLength).toBeCloseTo(2);
    expect(paths[0]!.edges).toHaveLength(2);
  });

  it('splitEdge inserts a sub-node and two half-edges', () => {
    const t = new Tree();
    const a = t.addNode(pt(0.1, 0.5));
    const { edge } = t.addNodeFrom(a.id, pt(0.9, 0.5));
    expect(edge.length).toBe(1);
    const mid = t.splitEdge(edge.id, pt(0.5, 0.5));
    expect(mid.isSub).toBe(true);
    expect(t.edges.size).toBe(2);
    expect(t.edgeList().every((e) => e.length === 0.5)).toBe(true);
  });

  it('deleteNodes removes incident edges', () => {
    const t = new Tree();
    const a = t.addNode(pt(0.1, 0.5));
    const { node: b } = t.addNodeFrom(a.id, pt(0.9, 0.5));
    t.deleteNodes([b.id]);
    expect(t.nodes.size).toBe(1);
    expect(t.edges.size).toBe(0);
  });

  it('edit scope runs cleanup once for nested edits', () => {
    const t = new Tree();
    const before = t.version;
    t.edit(() => {
      const a = t.addNode(pt(0.1, 0.5)); // each op is itself an edit() scope
      t.addNodeFrom(a.id, pt(0.9, 0.5));
    });
    // Exactly one cleanup despite multiple nested operations.
    expect(t.version).toBe(before + 1);
  });

  it('notifies listeners on change', () => {
    const t = new Tree();
    let calls = 0;
    t.onChange(() => calls++);
    t.addNode(pt(0.5, 0.5));
    expect(calls).toBe(1);
  });
});

describe('Conditions feasibility', () => {
  it('NodeOnCorner feasible only at a corner', () => {
    const t = new Tree();
    const n = t.addNode(pt(0, 0));
    const c = t.addCondition({ type: 'NodeOnCorner', tag: 'CNkn', node: n.id });
    expect(t.conditionFeasible(c)).toBe(true);
    t.moveNode(n.id, pt(0.5, 0.5));
    expect(t.conditionFeasible(c)).toBe(false);
  });

  it('NodeSymmetric needs symmetry enabled', () => {
    const t = new Tree();
    const n = t.addNode(pt(0.5, 0.3));
    const c = t.addCondition({ type: 'NodeSymmetric', tag: 'CNsn', node: n.id });
    expect(t.conditionFeasible(c)).toBe(false); // symmetry off
    t.setSymmetry({ has: true, loc: pt(0.5, 0.5), angle: 90 }); // vertical line x=0.5
    expect(t.conditionFeasible(c)).toBe(true);
  });

  it('NodesPaired mirrors across a vertical symmetry line', () => {
    const t = new Tree();
    t.setSymmetry({ has: true, loc: pt(0.5, 0.5), angle: 90 });
    const a = t.addNode(pt(0.3, 0.4));
    const b = t.addNode(pt(0.7, 0.4)); // mirror of a across x=0.5
    const c = t.addCondition({ type: 'NodesPaired', tag: 'CNpn', node1: a.id, node2: b.id });
    expect(t.conditionFeasible(c)).toBe(true);
    t.moveNode(b.id, pt(0.7, 0.41));
    expect(t.conditionFeasible(c)).toBe(false);
  });

  it('removing a referenced node drops its conditions', () => {
    const t = new Tree();
    const n = t.addNode(pt(0, 0));
    t.addCondition({ type: 'NodeOnEdge', tag: 'CNen', node: n.id });
    expect(t.conditionList()).toHaveLength(1);
    t.deleteNodes([n.id]);
    expect(t.conditionList()).toHaveLength(0);
  });
});
