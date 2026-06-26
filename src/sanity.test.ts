import { describe, it, expect } from 'vitest';

// Scaffold smoke test: verifies the toolchain (TS + vitest + jsdom) is wired up.
describe('scaffold', () => {
  it('runs TypeScript tests', () => {
    expect(1 + 1).toBe(2);
  });

  it('has a DOM (jsdom)', () => {
    const el = document.createElement('div');
    el.id = 'app';
    expect(el.id).toBe('app');
  });
});
