import { describe, it, expect } from 'vitest';
import {
  pt, add, sub, scale, dist, mag, normalize,
  distToLine, distToSegment, clampToPaper,
} from './geometry';

describe('geometry', () => {
  it('vector ops', () => {
    expect(add(pt(1, 2), pt(3, 4))).toEqual({ x: 4, y: 6 });
    expect(sub(pt(3, 4), pt(1, 1))).toEqual({ x: 2, y: 3 });
    expect(scale(pt(2, 3), 2)).toEqual({ x: 4, y: 6 });
  });

  it('mag and dist', () => {
    expect(mag(pt(3, 4))).toBe(5);
    expect(dist(pt(0, 0), pt(3, 4))).toBe(5);
  });

  it('normalize zero vector is safe', () => {
    expect(normalize(pt(0, 0))).toEqual({ x: 0, y: 0 });
    expect(mag(normalize(pt(10, 0)))).toBeCloseTo(1);
  });

  it('distToLine', () => {
    // line along x-axis, point at height 2
    expect(distToLine(pt(5, 2), pt(0, 0), pt(10, 0))).toBeCloseTo(2);
  });

  it('distToSegment clamps to endpoints', () => {
    // beyond the segment end → distance to the endpoint
    expect(distToSegment(pt(20, 0), pt(0, 0), pt(10, 0))).toBeCloseTo(10);
    expect(distToSegment(pt(5, 3), pt(0, 0), pt(10, 0))).toBeCloseTo(3);
  });

  it('clampToPaper', () => {
    expect(clampToPaper(pt(-1, 5), 10, 10)).toEqual({ x: 0, y: 5 });
    expect(clampToPaper(pt(12, 12), 10, 10)).toEqual({ x: 10, y: 10 });
  });
});
