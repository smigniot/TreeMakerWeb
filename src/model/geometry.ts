// 2D geometry primitives. Mirrors the role of tmPoint in the original model,
// but as a small set of pure functions over a plain {x, y} record (immutable,
// easy to inspect/serialize). Coordinates are in paper units (the paper is a
// width×height rectangle, origin at bottom-left as in TreeMaker's model space).

export interface Point {
  readonly x: number;
  readonly y: number;
}

export const pt = (x: number, y: number): Point => ({ x, y });

export const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Point, s: number): Point => ({ x: a.x * s, y: a.y * s });

export const dot = (a: Point, b: Point): number => a.x * b.x + a.y * b.y;

/** Euclidean magnitude. */
export const mag = (a: Point): number => Math.hypot(a.x, a.y);

/** Distance between two points. */
export const dist = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

/** Unit vector; returns {0,0} for a zero-length input. */
export function normalize(a: Point): Point {
  const m = mag(a);
  return m === 0 ? { x: 0, y: 0 } : { x: a.x / m, y: a.y / m };
}

/**
 * Perpendicular distance from point p to the infinite line through a→b.
 * Used for line hit-testing (matches the canvas ClickOn<tmEdge> logic).
 */
export function distToLine(p: Point, a: Point, b: Point): number {
  const ab = sub(b, a);
  const len = mag(ab);
  if (len === 0) return dist(p, a);
  // |cross(ab, ap)| / |ab|
  const ap = sub(p, a);
  return Math.abs(ab.x * ap.y - ab.y * ap.x) / len;
}

/**
 * Distance from p to the line *segment* a→b (clamped to the segment ends).
 * Preferred for hit-testing finite edges/paths.
 */
export function distToSegment(p: Point, a: Point, b: Point): number {
  const ab = sub(b, a);
  const len2 = dot(ab, ab);
  if (len2 === 0) return dist(p, a);
  let t = dot(sub(p, a), ab) / len2;
  t = Math.max(0, Math.min(1, t));
  return dist(p, add(a, scale(ab, t)));
}

/** Clamp a point into the [0,w]×[0,h] paper rectangle. */
export function clampToPaper(p: Point, w: number, h: number): Point {
  return {
    x: Math.max(0, Math.min(w, p.x)),
    y: Math.max(0, Math.min(h, p.y)),
  };
}
