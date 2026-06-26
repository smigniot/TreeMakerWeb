// Tiny SVG element helpers (no framework). Keeps designView readable.

const NS = 'http://www.w3.org/2000/svg';

export function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

/** Tag a part element so pointer hit-testing can recover its identity. */
export function tagPart(el: SVGElement, kind: string, id: number): void {
  el.dataset['kind'] = kind;
  el.dataset['id'] = String(id);
  el.classList.add('tm-part');
}

/** Recover a {kind,id} from an event target by walking up to a tagged element. */
export function partFromEvent(e: Event): { kind: string; id: number } | null {
  let node = e.target as Element | null;
  while (node && node instanceof Element) {
    const el = node as HTMLElement | SVGElement;
    if (el.dataset && el.dataset['kind'] && el.dataset['id']) {
      return { kind: el.dataset['kind'], id: Number(el.dataset['id']) };
    }
    node = node.parentElement;
  }
  return null;
}
