/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config';

// Single-page app at the repo root. The Orig/ reference tree and docs/ are not
// part of the build. Tests live alongside source (*.test.ts) and under test/.
export default defineConfig({
  root: '.',
  // Relative base so the built dist/ works whether served from a domain root or
  // any subfolder (GitHub Pages, a sub-path on a static host) with no config.
  base: './',
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'es2022',
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'test/unit/**/*.test.ts'],
    exclude: ['node_modules', 'dist', 'Orig', 'test/e2e/**'],
  },
});
