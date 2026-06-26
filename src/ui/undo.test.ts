import { describe, it, expect } from 'vitest';
import { Tree } from '../model/tree';
import { pt } from '../model/geometry';
import { UndoManager } from './undo';

describe('UndoManager', () => {
  it('undoes and redoes discrete edits', () => {
    const t = new Tree();
    const um = new UndoManager(t);
    expect(um.canUndo).toBe(false);

    const a = t.addNode(pt(0.2, 0.5));
    um.record('Add node');
    t.addNodeFrom(a.id, pt(0.8, 0.5));
    um.record('Add node');
    expect(t.nodes.size).toBe(2);

    um.undo(); // back to 1 node
    expect(t.nodes.size).toBe(1);
    expect(um.canRedo).toBe(true);

    um.undo(); // back to empty
    expect(t.nodes.size).toBe(0);
    expect(um.canUndo).toBe(false);

    um.redo();
    expect(t.nodes.size).toBe(1);
    um.redo();
    expect(t.nodes.size).toBe(2);
    expect(um.canRedo).toBe(false);
  });

  it('a new edit clears the redo stack', () => {
    const t = new Tree();
    const um = new UndoManager(t);
    const a = t.addNode(pt(0.2, 0.5));
    um.record('Add');
    um.undo();
    expect(um.canRedo).toBe(true);
    t.addNode(pt(0.5, 0.5));
    um.record('Add other');
    expect(um.canRedo).toBe(false);
    void a;
  });
});
