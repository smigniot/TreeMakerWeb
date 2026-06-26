// Token cursor over a legacy TreeMaker file. The format is positional, one
// value per line (PutPOD writes value + endl). A tmPoint is two lines (x, y);
// a pointer is one line (the target's 1-based index, 0 = null); an array is a
// size line followed by that many index lines. Line endings may be \r, \n, or
// \r\n (TM4 wrote \r). See docs/analysis/03-io-and-conditions.md §A.

export class Cursor {
  private readonly tokens: string[];
  private pos = 0;

  constructor(text: string) {
    // Split on any line-ending; keep empty tokens (empty labels are blank lines).
    this.tokens = text.split(/\r\n|\r|\n/);
  }

  get remaining(): number {
    return this.tokens.length - this.pos;
  }

  atEnd(): boolean {
    // Tolerate trailing blank tokens (a final newline).
    for (let i = this.pos; i < this.tokens.length; i++) {
      if (this.tokens[i] !== '') return false;
    }
    return true;
  }

  /** Read one raw token (line). */
  str(): string {
    if (this.pos >= this.tokens.length) throw new Error('legacy parse: unexpected end of file');
    return this.tokens[this.pos++]!;
  }

  num(): number {
    const t = this.str().trim();
    // TM4 emitted platform NaN tokens like "NAN(017)"; the C++ reader maps to 0.
    if (/^[+-]?nan/i.test(t)) return 0;
    const v = Number(t);
    if (Number.isNaN(v)) throw new Error(`legacy parse: expected number, got "${t}"`);
    return v;
  }

  int(): number {
    return Math.trunc(this.num());
  }

  bool(): boolean {
    const t = this.str().trim();
    if (t === 'true') return true;
    if (t === 'false') return false;
    throw new Error(`legacy parse: expected bool, got "${t}"`);
  }

  /** A tmPoint = x then y. */
  point(): { x: number; y: number } {
    const x = this.num();
    const y = this.num();
    return { x, y };
  }

  /** A pointer = the target's 1-based index (0 = null). */
  ptr(): number {
    return this.int();
  }

  /** An array = size line then that many index lines. Returns the indices. */
  ptrArray(): number[] {
    const n = this.int();
    const out: number[] = [];
    for (let i = 0; i < n; i++) out.push(this.ptr());
    return out;
  }

  /** An owner pointer: isPoly flag, then a poly index if set. */
  ownerPtr(): void {
    const isPoly = this.int();
    if (isPoly) this.ptr(); // consume the poly index (no polys in P1 imports)
  }

  /** Skip n tokens (used to skip unrecognized conditions by their numLines). */
  skip(n: number): void {
    this.pos += n;
  }
}
