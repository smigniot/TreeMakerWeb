// Folded-form view: a 2D preview of the folded base. Plots the crease pattern's
// vertices/creases/facets in (elevation, depth) coordinates instead of paper
// (x, y) — the same projection as the C++ tmwxFoldedFormFrame. Elevation is the
// horizontal axis; depth increases downward (root at top).

import type { CreasePatternResult } from '../wasm/engine';
import { svgEl } from './svg';

export class FoldedFormView {
  private svg: SVGSVGElement;
  private cp: CreasePatternResult | null = null;

  constructor(private host: HTMLElement) {
    this.svg = svgEl('svg', { class: 'tm-folded', width: '100%', height: '100%' });
    host.appendChild(this.svg);
    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(() => this.render()).observe(host);
    }
  }

  setCreasePattern(cp: CreasePatternResult | null): void {
    this.cp = cp;
    this.render();
  }

  private render(): void {
    this.svg.replaceChildren();
    const cp = this.cp;
    if (!cp || cp.vertices.length === 0) return;

    let eMin = Infinity, eMax = -Infinity, dMin = Infinity, dMax = -Infinity;
    for (const v of cp.vertices) {
      if (v.e < eMin) eMin = v.e; if (v.e > eMax) eMax = v.e;
      if (v.d < dMin) dMin = v.d; if (v.d > dMax) dMax = v.d;
    }
    const r = this.host.getBoundingClientRect();
    const w = r.width || 240, h = r.height || 240;
    const m = 10;
    const spanE = Math.max(1e-9, eMax - eMin);
    const spanD = Math.max(1e-9, dMax - dMin);
    const scale = Math.min((w - 2 * m) / spanE, (h - 2 * m) / spanD);
    const drawnW = spanE * scale, drawnH = spanD * scale;
    const ox = (w - drawnW) / 2, oy = (h - drawnH) / 2;
    const sx = (e: number): number => ox + (e - eMin) * scale;
    const sy = (d: number): number => oy + (d - dMin) * scale;

    const vloc = new Map(cp.vertices.map((v) => [v.i, { x: sx(v.e), y: sy(v.d) }]));

    // Facets (filled, semi-transparent so stacked layers read as a silhouette).
    for (const f of cp.facets) {
      const pts = f.vs.map((i) => vloc.get(i)).filter(Boolean) as { x: number; y: number }[];
      if (pts.length < 3) continue;
      this.svg.appendChild(svgEl('polygon', {
        points: pts.map((p) => `${p.x},${p.y}`).join(' '),
        class: 'tm-folded-facet',
      }));
    }
    // Creases (mountain red / valley blue, matching the main canvas).
    const foldClass = ['tm-flat', 'tm-mountain', 'tm-valley', 'tm-border'];
    for (const c of cp.creases) {
      const a = vloc.get(c.a), b = vloc.get(c.b);
      if (!a || !b) continue;
      this.svg.appendChild(svgEl('line', {
        x1: a.x, y1: a.y, x2: b.x, y2: b.y,
        class: `tm-crease ${foldClass[c.f] ?? 'tm-flat'}`,
      }));
    }
  }
}
