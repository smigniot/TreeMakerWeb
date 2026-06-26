// Maps between paper (model) coordinates and screen (SVG) pixels.
//
// Model space: origin bottom-left, +y up, units = paper units (the paper is a
// width×height rectangle). Screen space: origin top-left, +y down. So the
// transform flips y (matches the C++ canvas TreeToDC, which uses paperHeight−y).

import type { Point } from '../model/geometry';

export interface Viewport {
  width: number; // px
  height: number; // px
}

export class ViewTransform {
  /** px per paper unit. */
  scale = 1;
  /** screen px of the paper's bottom-left origin. */
  originX = 0;
  originY = 0;

  constructor(public paperW = 1, public paperH = 1) {}

  /** Fit the paper into the viewport with a margin (fraction of the smaller side). */
  fit(vp: Viewport, margin = 0.08): void {
    const m = Math.min(vp.width, vp.height) * margin;
    const availW = Math.max(1, vp.width - 2 * m);
    const availH = Math.max(1, vp.height - 2 * m);
    this.scale = Math.min(availW / this.paperW, availH / this.paperH);
    const drawnW = this.paperW * this.scale;
    const drawnH = this.paperH * this.scale;
    this.originX = (vp.width - drawnW) / 2;
    // origin is the bottom-left in screen px: top padding + paper height
    this.originY = (vp.height - drawnH) / 2 + drawnH;
  }

  /** Paper → screen px. */
  toScreen(p: Point): Point {
    return {
      x: this.originX + p.x * this.scale,
      y: this.originY - p.y * this.scale,
    };
  }

  /** Screen px → paper. */
  toPaper(sx: number, sy: number): Point {
    return {
      x: (sx - this.originX) / this.scale,
      y: (this.originY - sy) / this.scale,
    };
  }

  /** Paper-unit length → screen px. */
  lenToScreen(len: number): number {
    return len * this.scale;
  }
}
