import { defineConfig, devices } from '@playwright/test';

// E2E tests drive the Vite dev server. Chromium only for now (modern evergreen
// target per DESIGN.md §9).
export default defineConfig({
  testDir: './test/e2e',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
