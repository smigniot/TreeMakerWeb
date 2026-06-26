import { describe, it, expect, beforeEach } from 'vitest';
import { Tree } from '../model/tree';
import { DesignView } from './designView';

// jsdom has no layout; DesignView falls back to an 800×600 viewport, so a click
// near the host center maps to roughly paper (0.5, 0.5).

function pointerOn(target: Element, clientX: number, clientY: number, shiftKey = false): void {
  const e = Object.assign(new Event('pointerdown', { bubbles: true }), {
    clientX, clientY, shiftKey, pointerId: 1,
  });
  target.dispatchEvent(e);
}

function keyOn(target: Element, key: string): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
}

describe('DesignView interactions', () => {
  let host: HTMLElement;
  let tree: Tree;
  let view: DesignView;
  let svg: SVGSVGElement;

  beforeEach(() => {
    document.body.replaceChildren();
    host = document.createElement('div');
    document.body.appendChild(host);
    tree = new Tree();
    view = new DesignView(host, tree);
    svg = host.querySelector('svg')!;
  });

  it('renders an SVG surface with layers', () => {
    expect(svg).toBeTruthy();
    expect(host.querySelector('.tm-paper')).toBeTruthy();
  });

  it('click on empty space adds the root node', () => {
    pointerOn(svg, 400, 300);
    expect(tree.nodes.size).toBe(1);
    expect(host.querySelectorAll('.tm-node')).toHaveLength(1);
    // the new node is selected
    expect(view.selection.nodes()).toHaveLength(1);
  });

  it('second empty click adds a child of the selected node', () => {
    pointerOn(svg, 400, 300); // root
    pointerOn(svg, 500, 200); // child
    expect(tree.nodes.size).toBe(2);
    expect(tree.edges.size).toBe(1);
    expect(host.querySelectorAll('.tm-node')).toHaveLength(2);
    expect(host.querySelectorAll('.tm-edge')).toHaveLength(1);
  });

  it('clicking a node selects it; shift-click toggles', () => {
    pointerOn(svg, 400, 300);
    pointerOn(svg, 500, 200);
    // Each render replaces the SVG nodes, so re-query before each interaction
    // (a real user always clicks the live element).
    const nodeAt = (i: number) => host.querySelectorAll<SVGCircleElement>('.tm-node')[i]!;
    expect(host.querySelectorAll('.tm-node')).toHaveLength(2);
    // plain-click first node → only it selected
    pointerOn(nodeAt(0), 0, 0);
    expect(view.selection.size).toBe(1);
    // shift-click second node → both selected
    pointerOn(nodeAt(1), 0, 0, true);
    expect(view.selection.size).toBe(2);
  });

  it('Delete removes the selected node and its edge', () => {
    pointerOn(svg, 400, 300);
    pointerOn(svg, 500, 200); // child selected
    expect(tree.nodes.size).toBe(2);
    keyOn(svg, 'Delete');
    expect(tree.nodes.size).toBe(1);
    expect(tree.edges.size).toBe(0);
    expect(view.selection.size).toBe(0);
  });

  it('Escape clears the selection', () => {
    pointerOn(svg, 400, 300);
    expect(view.selection.size).toBe(1);
    keyOn(svg, 'Escape');
    expect(view.selection.size).toBe(0);
  });
});
