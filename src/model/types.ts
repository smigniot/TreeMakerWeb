// Core model types. The data model is ID-based (not pointer/dpptr-based as in
// the C++ original): every part has a numeric id unique within its kind, and
// references are stored as ids resolved through the Tree's maps. This removes
// the entire dangle-proof-pointer layer (see docs/analysis/01-core-model.md §3.3)
// in favor of plain GC + explicit edits.

import type { Point } from './geometry';

export type NodeId = number;
export type EdgeId = number;
export type PathId = number;
export type ConditionId = number;

/** A vertex of the abstract tree (a flap tip when it is a leaf). */
export interface TreeNode {
  id: NodeId;
  loc: Point;
  label: string;
  // --- derived during cleanup ---
  /** Degree 1 in the tree graph → tip of a flap. */
  isLeaf: boolean;
  /** Created by splitting an edge (an interior "sub" node). User-meaningful. */
  isSub: boolean;
}

/** An edge of the tree = a flap (or flap segment). */
export interface Edge {
  id: EdgeId;
  fromNode: NodeId;
  toNode: NodeId;
  /** Nominal length in tree units (> 0). */
  length: number;
  /** Fractional stretch; ≥ -1. Strained length = length * (1 + strain). */
  strain: number;
  /** Relative stiffness for strain optimization (> 0). */
  stiffness: number;
  label: string;
}

/** The unique route between two nodes through the tree. */
export interface Path {
  id: PathId;
  node1: NodeId;
  node2: NodeId;
  /** Edges along the route, in order from node1 to node2. */
  edges: EdgeId[];
  // --- derived during cleanup ---
  /** Both endpoints are leaf nodes (an "axial"/packing-relevant path). */
  isLeafPath: boolean;
  /** Sum of nominal edge lengths along the route. */
  minTreeLength: number;
  /** Minimum required paper distance = scale * Σ strained edge length. */
  minPaperLength: number;
  /** Actual paper distance between the two endpoint nodes. */
  actPaperLength: number;
  /** Endpoints are exactly at minimum separation (flaps touching). */
  isActive: boolean;
  /** Endpoints are at least minimum separation apart. */
  isFeasible: boolean;
}

export interface Paper {
  width: number;
  height: number;
}

export interface Symmetry {
  has: boolean;
  loc: Point;
  /** Degrees. */
  angle: number;
}

/** Tolerances mirroring the C++ model (tmPart.h). */
export const DIST_TOL = 1e-4;
export const MIN_EDGE_LENGTH = 1e-6;
