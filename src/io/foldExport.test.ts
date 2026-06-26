import { describe, it, expect } from 'vitest';
import { creasePatternToFold } from './foldExport';
import type { CreasePatternResult } from '../wasm/engine';

// Vertices with non-contiguous ids (10, 20, 30, 40) to exercise the remap.
const cp: CreasePatternResult = {
  ok: true,
  status: 0,
  vertices: [
    { i: 10, x: 0, y: 0, e: 0, d: 0 },
    { i: 20, x: 1, y: 0, e: 0, d: 0 },
    { i: 30, x: 1, y: 1, e: 0, d: 0 },
    { i: 40, x: 0, y: 1, e: 0, d: 0 },
  ],
  creases: [
    { i: 1, a: 10, b: 30, k: 0, f: 1 }, // mountain
    { i: 2, a: 20, b: 40, k: 0, f: 2 }, // valley
    { i: 3, a: 10, b: 20, k: 0, f: 3 }, // border
  ],
  facets: [{ i: 1, o: 0, vs: [10, 20, 30, 40] }],
};

describe('creasePatternToFold', () => {
  it('remaps vertices to 0-based contiguous indices', () => {
    const fold = creasePatternToFold(cp);
    expect(fold.vertices_coords).toEqual([[0, 0], [1, 0], [1, 1], [0, 1]]);
    // crease 10→30 becomes 0→2; 20→40 becomes 1→3; 10→20 becomes 0→1
    expect(fold.edges_vertices).toEqual([[0, 2], [1, 3], [0, 1]]);
    expect(fold.faces_vertices).toEqual([[0, 1, 2, 3]]);
  });

  it('maps fold direction to FOLD assignment + angle', () => {
    const fold = creasePatternToFold(cp);
    expect(fold.edges_assignment).toEqual(['M', 'V', 'B']);
    expect(fold.edges_foldAngle).toEqual([-180, 180, 0]);
  });

  it('declares the FOLD frame as a 2D crease pattern', () => {
    const fold = creasePatternToFold(cp);
    expect(fold.file_spec).toBe(1.1);
    expect(fold.frame_classes).toContain('creasePattern');
  });
});
