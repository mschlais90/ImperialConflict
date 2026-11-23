import { defineConfig, devices } from '@playwright/test';

// E2E_PORT lets the suite run while another dev server already holds 5173
// (reuseExistingServer would otherwise silently test whatever app is there).
const port = Number(process.env.E2E_PORT ?? 5173);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './src/tests/e2e',
  // Game boot (Vite transforms + Phaser init + galaxy generation) can take ~20s,
  // so the default 30s per-test budget is too tight.
  timeout: 90_000,
  webServer: {
    command: `npm run dev -- --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
