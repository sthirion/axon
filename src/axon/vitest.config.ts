import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { conditions: ['source'] },
  test: {
    passWithNoTests: false,
    projects: [
      { extends: true, test: { name: 'unit', include: ['src/**/*.test.ts'] } },
      { extends: true, test: { name: 'integration', include: ['test/**/*.spec.ts'] } },
    ],
  },
});
