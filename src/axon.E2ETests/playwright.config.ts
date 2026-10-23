import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

const baseURL = 'http://127.0.0.1:3100';
// A second server with short lifetimes, so the cleanup tests do not wait minutes or hours.
const lifetimeBaseURL = 'http://127.0.0.1:3101';
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const startCommand = 'npm run start -w src/axon';

export default defineConfig({
  testDir: '.',
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL, trace: 'retain-on-failure' },
  projects: [
    {
      name: 'chromium',
      testIgnore: 'lifetime.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'lifetime',
      testMatch: 'lifetime.spec.ts',
      use: { ...devices['Desktop Chrome'], baseURL: lifetimeBaseURL },
    },
  ],
  webServer: [
    {
      command: process.env.CI ? startCommand : `npm run build && ${startCommand}`,
      cwd: repoRoot,
      env: { PORT: '3100' },
      url: `${baseURL}/healthz`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: startCommand,
      cwd: repoRoot,
      env: {
        PORT: '3101',
        GAME_EMPTY_TTL_MS: '4000',
        GAME_MAX_AGE_MS: '10000',
        SWEEP_INTERVAL_MS: '250',
      },
      url: `${lifetimeBaseURL}/healthz`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
