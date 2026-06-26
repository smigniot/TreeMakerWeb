// Export a crease pattern as a standalone SVG document (paper outline + creases
// coloured by fold). Pure string generation — no DOM — so it is easy to test and
// reuse. Coordinates are paper units, y-flipped to SVG's top-left origin; styles
// are inline per element for maximum compatibility with vector editors
// (Illustrator, Inkscape) and browsers.

import type { CreasePatternResult } from '../wasm/engine';

export interface SvgExportOptions {
  /** Max pixel dimension of the longer paper side (default 1000). */
  size?: number;
  /** Draw facet outlines underneath the creases (default false). */
  includeFacets?: boolean;
}

interface Paper {
  width: number;
  height: number;
}

// Fold convention: mountain = red solid, valley = blue dashed, border = black,
// flat/unassigned = light grey.
const FOLD_STROKE = ['#bbbbbb', '#c01c28', '#1a5fb4', '#333333'];
const FOLD_DASH = ['', '', '6,4', ''];

const esc = (n: number): string => Number(n.toFixed(3)).toString();

export function creasePatternToSvg(cp: CreasePatternResult, paper: Paper, opts: SvgExportOptions = {}): string {
  const size = opts.size ?? 1000;
  const pw = paper.width || 1;
  const ph = paper.height || 1;
  const scale = size / Math.max(pw, ph);
  const w = pw * scale;
  const h = ph * scale;

  const sx = (x: number): string => esc(x * scale);
  const sy = (y: number): string => esc((ph - y) * scale); // y-flip

  const vloc = new Map(cp.vertices.map((v) => [v.i, { x: sx(v.x), y: sy(v.y) }]));

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${esc(w)}" height="${esc(h)}" ` +
    `viewBox="0 0 ${esc(w)} ${esc(h)}">`,
  );
  parts.push(`<rect x="0" y="0" width="${esc(w)}" height="${esc(h)}" fill="#fffdf7" stroke="#333" stroke-width="1"/>`);

  if (opts.includeFacets) {
    parts.push('<g fill="none" stroke="#ddd" stroke-width="0.5">');
    for (const f of cp.facets) {
      const pts = f.vs.map((i) => vloc.get(i)).filter(Boolean) as { x: string; y: string }[];
      if (pts.length < 3) continue;
      parts.push(`<polygon points="${pts.map((p) => `${p.x},${p.y}`).join(' ')}"/>`);
    }
    parts.push('</g>');
  }

  parts.push('<g fill="none" stroke-width="1">');
  for (const c of cp.creases) {
    const a = vloc.get(c.a);
    const b = vloc.get(c.b);
    if (!a || !b) continue;
    const stroke = FOLD_STROKE[c.f] ?? FOLD_STROKE[0];
    const dash = FOLD_DASH[c.f] ?? '';
    const dashAttr = dash ? ` stroke-dasharray="${dash}"` : '';
    parts.push(`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${stroke}"${dashAttr}/>`);
  }
  parts.push('</g>');
  parts.push('</svg>');
  return parts.join('\n') + '\n';
}
