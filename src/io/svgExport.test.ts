import { describe, it, expect } from 'vitest';
import { creasePatternToSvg } from './svgExport';
import type { CreasePatternResult } from '../wasm/engine';

const cp: CreasePatternResult = {
  ok: true,
  status: 0,
  vertices: [
    { i: 1, x: 0, y: 0, e: 0, d: 0 },
    { i: 2, x: 1, y: 0, e: 0, d: 0 },
    { i: 3, x: 1, y: 1, e: 0, d: 0 },
    { i: 4, x: 0, y: 1, e: 0, d: 0 },
  ],
  creases: [
    { i: 1, a: 1, b: 3, k: 0, f: 1 }, // mountain diagonal
    { i: 2, a: 2, b: 4, k: 0, f: 2 }, // valley diagonal
  ],
  facets: [{ i: 1, o: 0, vs: [1, 2, 3, 4] }],
};

describe('creasePatternToSvg', () => {
  it('produces a standalone SVG with the paper and creases', () => {
    const svg = creasePatternToSvg(cp, { width: 1, height: 1 }, { size: 100 });
    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('viewBox="0 0 100 100"');
    expect(svg).toContain('<rect'); // paper
    // one mountain (red) + one valley (blue dashed) line
    expect((svg.match(/<line /g) ?? [])).toHaveLength(2);
    expect(svg).toContain('stroke="#c01c28"');
    expect(svg).toContain('stroke="#1a5fb4"');
    expect(svg).toContain('stroke-dasharray="6,4"');
  });

  it('y-flips coordinates (paper origin bottom-left → SVG top-left)', () => {
    const svg = creasePatternToSvg(cp, { width: 1, height: 1 }, { size: 100 });
    // vertex 1 at paper (0,0) → svg (0,100); vertex 3 at (1,1) → svg (100,0)
    expect(svg).toContain('x1="0" y1="100" x2="100" y2="0"');
  });

  it('includes facet outlines when requested', () => {
    const svg = creasePatternToSvg(cp, { width: 1, height: 1 }, { includeFacets: true });
    expect(svg).toContain('<polygon');
  });
});
