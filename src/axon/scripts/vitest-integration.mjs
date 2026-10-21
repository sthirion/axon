// Entry for the agent test runner (suites/integration.json `bin`): the vitest adapter cannot pass --project.
process.argv.push('--project', 'integration');
await import('../../../node_modules/vitest/vitest.mjs');
