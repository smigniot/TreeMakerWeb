// Export a crease pattern to the FOLD format — the standard JSON interchange for
// origami crease patterns (https://github.com/edemaine/fold), readable by tools
// like Origami Simulator. Pure data transformation (no DOM).
//
// FOLD requires 0-based contiguous vertex indices into `vertices_coords`; our CP
// vertices carry arbitrary 1-based ids, so we remap. Coordinates are paper units
// with y up (FOLD's convention matches TreeMaker's model space — no flip).

import type { CreasePatternResult } from '../wasm/engine';

export interface FoldDocument {
  file_spec: number;
  file_creator: string;
  file_classes: string[];
  frame_classes: string[];
  frame_attributes: string[];
  vertices_coords: number[][];
  edges_vertices: number[][];
  edges_assignment: string[];
  edges_foldAngle: number[];
  faces_vertices: number[][];
}

// CreaseFold (0 flat, 1 mountain, 2 valley, 3 border) → FOLD assignment letter.
const ASSIGNMENT = ['F', 'M', 'V', 'B'];
// Flat-foldable angles: mountain folds back (−180), valley folds forward (+180).
const FOLD_ANGLE: Record<string, number> = { M: -180, V: 180, B: 0, F: 0, U: 0 };

export function creasePatternToFold(cp: CreasePatternResult): FoldDocument {
  const idxOf = new Map<number, number>();
  cp.vertices.forEach((v, i) => idxOf.set(v.i, i));

  const vertices_coords = cp.vertices.map((v) => [round(v.x), round(v.y)]);

  const edges_vertices: number[][] = [];
  const edges_assignment: string[] = [];
  const edges_foldAngle: number[] = [];
  for (const c of cp.creases) {
    const a = idxOf.get(c.a);
    const b = idxOf.get(c.b);
    if (a === undefined || b === undefined) continue;
    edges_vertices.push([a, b]);
    const asg = ASSIGNMENT[c.f] ?? 'U';
    edges_assignment.push(asg);
    edges_foldAngle.push(FOLD_ANGLE[asg] ?? 0);
  }

  const faces_vertices = cp.facets
    .map((f) => f.vs.map((i) => idxOf.get(i)).filter((x): x is number => x !== undefined))
    .filter((vs) => vs.length >= 3);

  return {
    file_spec: 1.1,
    file_creator: 'TreeMakerWeb',
    file_classes: ['singleModel'],
    frame_classes: ['creasePattern'],
    frame_attributes: ['2D'],
    vertices_coords,
    edges_vertices,
    edges_assignment,
    edges_foldAngle,
    faces_vertices,
  };
}

export function creasePatternToFoldString(cp: CreasePatternResult): string {
  return JSON.stringify(creasePatternToFold(cp), null, 2) + '\n';
}

function round(n: number): number {
  return Number(n.toFixed(6));
}
