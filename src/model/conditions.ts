// User-specified constraints on the design ("conditions"). In P1 these are pure
// data plus a *feasibility* check (does the current geometry satisfy them?),
// which needs only function values — not the gradients or the optimizer that
// turn them into actual constraints during packing (that is P2). See
// docs/analysis/03-io-and-conditions.md §B.

import type { Point } from './geometry';
import { dist, sub } from './geometry';
import type { ConditionId, NodeId, EdgeId } from './types';
import { DIST_TOL } from './types';

// Each condition carries the original 4-char legacy tag for round-tripping.
export type Condition =
  | { id: ConditionId; type: 'NodeFixed'; tag: 'CNfn'; node: NodeId; xFixed: boolean; yFixed: boolean; xFixValue: number; yFixValue: number }
  | { id: ConditionId; type: 'NodeOnEdge'; tag: 'CNen'; node: NodeId }
  | { id: ConditionId; type: 'NodeOnCorner'; tag: 'CNkn'; node: NodeId }
  | { id: ConditionId; type: 'NodeSymmetric'; tag: 'CNsn'; node: NodeId }
  | { id: ConditionId; type: 'NodesPaired'; tag: 'CNpn'; node1: NodeId; node2: NodeId }
  | { id: ConditionId; type: 'NodesCollinear'; tag: 'CNcn'; node1: NodeId; node2: NodeId; node3: NodeId }
  | { id: ConditionId; type: 'EdgeLengthFixed'; tag: 'CNfe'; edge: EdgeId }
  | { id: ConditionId; type: 'EdgesSameStrain'; tag: 'CNes'; edge1: EdgeId; edge2: EdgeId }
  | { id: ConditionId; type: 'PathActive'; tag: 'CNap'; node1: NodeId; node2: NodeId }
  | { id: ConditionId; type: 'PathAngleFixed'; tag: 'CNfp'; node1: NodeId; node2: NodeId; angle: number }
  | { id: ConditionId; type: 'PathAngleQuant'; tag: 'CNqp'; node1: NodeId; node2: NodeId; quant: number; quantOffset: number };

export type ConditionType = Condition['type'];

/** Omit that distributes over the discriminated union (plain Omit collapses it). */
export type DistributiveOmit<T, K extends keyof any> = T extends unknown ? Omit<T, K> : never;

/** A condition without its id, for creation via Tree.addCondition. */
export type NewCondition = DistributiveOmit<Condition, 'id'>;

/** Lookups the feasibility check needs from the surrounding tree. */
export interface ConditionContext {
  nodeLoc(id: NodeId): Point | undefined;
  edgeStrain(id: EdgeId): number | undefined;
  /** Is the path between these two leaf nodes active (taut)? */
  pathActive(node1: NodeId, node2: NodeId): boolean | undefined;
  paper: { width: number; height: number };
  symmetry: { has: boolean; loc: Point; angle: number };
}

const near = (a: number, b: number, tol = DIST_TOL): boolean => Math.abs(a - b) <= tol;

/** Signed perpendicular distance from p to the symmetry line. */
function distToSymLine(p: Point, loc: Point, angleDeg: number): number {
  const a = (angleDeg * Math.PI) / 180;
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  const v = sub(p, loc);
  return dx * v.y - dy * v.x; // cross(dir, v)
}

/** Reflect p across the symmetry line: keep the along-line part, negate the
 * perpendicular part. reflected = loc + 2·(v·dir)·dir − v, where v = p − loc. */
function reflect(p: Point, loc: Point, angleDeg: number): Point {
  const a = (angleDeg * Math.PI) / 180;
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  const v = sub(p, loc);
  const proj = v.x * dx + v.y * dy; // component along the line
  return {
    x: loc.x + 2 * proj * dx - v.x,
    y: loc.y + 2 * proj * dy - v.y,
  };
}

function onPaperEdge(p: Point, w: number, h: number): boolean {
  return near(p.x, 0) || near(p.x, w) || near(p.y, 0) || near(p.y, h);
}

/**
 * Returns whether a condition is currently satisfied by the geometry, or
 * `undefined` if it cannot be evaluated (e.g. a referenced part is missing).
 * Mirrors tmCondition::CalcFeasibility (function values only).
 */
export function conditionFeasible(c: Condition, ctx: ConditionContext): boolean | undefined {
  const { width: w, height: h } = ctx.paper;
  switch (c.type) {
    case 'NodeFixed': {
      const p = ctx.nodeLoc(c.node);
      if (!p) return undefined;
      return (!c.xFixed || near(p.x, c.xFixValue)) && (!c.yFixed || near(p.y, c.yFixValue));
    }
    case 'NodeOnEdge': {
      const p = ctx.nodeLoc(c.node);
      return p ? onPaperEdge(p, w, h) : undefined;
    }
    case 'NodeOnCorner': {
      const p = ctx.nodeLoc(c.node);
      if (!p) return undefined;
      return (near(p.x, 0) || near(p.x, w)) && (near(p.y, 0) || near(p.y, h));
    }
    case 'NodeSymmetric': {
      const p = ctx.nodeLoc(c.node);
      if (!p) return undefined;
      if (!ctx.symmetry.has) return false; // infeasible without symmetry
      return near(distToSymLine(p, ctx.symmetry.loc, ctx.symmetry.angle), 0);
    }
    case 'NodesPaired': {
      const p1 = ctx.nodeLoc(c.node1);
      const p2 = ctx.nodeLoc(c.node2);
      if (!p1 || !p2) return undefined;
      if (!ctx.symmetry.has) return false;
      const m = reflect(p1, ctx.symmetry.loc, ctx.symmetry.angle);
      return near(dist(m, p2), 0);
    }
    case 'NodesCollinear': {
      const p1 = ctx.nodeLoc(c.node1);
      const p2 = ctx.nodeLoc(c.node2);
      const p3 = ctx.nodeLoc(c.node3);
      if (!p1 || !p2 || !p3) return undefined;
      const cross = (p2.x - p1.x) * (p3.y - p1.y) - (p2.y - p1.y) * (p3.x - p1.x);
      return near(cross, 0);
    }
    case 'EdgeLengthFixed': {
      const s = ctx.edgeStrain(c.edge);
      return s === undefined ? undefined : near(s, 0);
    }
    case 'EdgesSameStrain': {
      const s1 = ctx.edgeStrain(c.edge1);
      const s2 = ctx.edgeStrain(c.edge2);
      return s1 === undefined || s2 === undefined ? undefined : near(s1, s2);
    }
    case 'PathActive':
      return ctx.pathActive(c.node1, c.node2);
    case 'PathAngleFixed': {
      const p1 = ctx.nodeLoc(c.node1);
      const p2 = ctx.nodeLoc(c.node2);
      if (!p1 || !p2) return undefined;
      const ang = (Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180) / Math.PI;
      return angleNear(ang, c.angle);
    }
    case 'PathAngleQuant': {
      const p1 = ctx.nodeLoc(c.node1);
      const p2 = ctx.nodeLoc(c.node2);
      if (!p1 || !p2) return undefined;
      const ang = (Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180) / Math.PI;
      const step = 180 / c.quant;
      const nearest = Math.round((ang - c.quantOffset) / step) * step + c.quantOffset;
      return angleNear(ang, nearest);
    }
  }
}

/** Angle comparison modulo 180° (paths are undirected for angle purposes). */
function angleNear(a: number, b: number): boolean {
  let d = (a - b) % 180;
  if (d > 90) d -= 180;
  if (d < -90) d += 180;
  return Math.abs(d) <= 0.01;
}
