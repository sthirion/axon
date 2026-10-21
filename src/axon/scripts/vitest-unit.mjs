// Entry for the agent test runner (suites/unit.json `bin`): the vitest adapter cannot pass --project.
process.argv.push('--project', 'unit');
await import('../../../node_modules/vitest/vitest.mjs');
