import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

const baseURL = 'http://127.0.0.1:3100';
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  testDir: '.',
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: process.env.CI
      ? 'npm run start -w src/axon'
      : 'npm run build && npm run start -w src/axon',
    cwd: repoRoot,
    env: { PORT: '3100' },
    url: `${baseURL}/healthz`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
