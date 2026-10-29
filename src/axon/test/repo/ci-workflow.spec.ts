import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { checkWorkflow } from './checkWorkflow.js';

type Dict = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const workflowPath = path.join(repoRoot, '.github', 'workflows', 'ci.yml');
const CLEAN_TREE = 'test -z "$(git status --porcelain)"';

function aWorkflow(): Dict {
  return parse(readFileSync(workflowPath, 'utf8')) as Dict;
}

function steps(doc: Dict): Dict[] {
  return doc.jobs['build-test'].steps;
}

function stepRunning(doc: Dict, run: string): Dict {
  const step = steps(doc).find((s) => s.run === run);
  if (!step) throw new Error(`step not found: ${run}`);
  return step;
}

function uploadStep(doc: Dict): Dict {
  const step = steps(doc).find((s) => String(s.uses).startsWith('actions/upload-artifact'));
  if (!step) throw new Error('upload step not found');
  return step;
}

function usesStep(doc: Dict, action: string): Dict {
  const step = steps(doc).find((s) => String(s.uses).startsWith(`${action}@`));
  if (!step) throw new Error(`step not found: ${action}`);
  return step;
}

function setupNodeStep(doc: Dict): Dict {
  return usesStep(doc, 'actions/setup-node');
}

const mutations: [string, (doc: Dict) => void][] = [
  [
    'continue-on-error on the lint step',
    (doc) => (stepRunning(doc, 'npm run lint')['continue-on-error'] = true),
  ],
  [
    'test:coverage moved before build',
    (doc) => {
      const list = steps(doc);
      const [coverage] = list.splice(
        list.findIndex((s) => s.run === 'npm run test:coverage'),
        1,
      );
      list.splice(
        list.findIndex((s) => s.run === 'npm run build'),
        0,
        coverage,
      );
    },
  ],
  ['upload step if changed to always()', (doc) => (uploadStep(doc).if = 'always()')],
  ['permissions set to write-all', (doc) => (doc.permissions = 'write-all')],
  ['contents set to write', (doc) => (doc.permissions.contents = 'write')],
  ['issues write added', (doc) => (doc.permissions.issues = 'write')],
  [
    'continue-on-error on the coverage step',
    (doc) => (usesStep(doc, 'actions/github-script')['continue-on-error'] = true),
  ],
  [
    'if added to the coverage step',
    (doc) => (usesStep(doc, 'actions/github-script').if = 'always()'),
  ],
  ['push trigger removed', (doc) => delete doc.on.push],
  ['cancel-in-progress set to false', (doc) => (doc.concurrency['cancel-in-progress'] = false)],
  [
    'if added to the build step',
    (doc) => (stepRunning(doc, 'npm run build').if = "github.event_name == 'push'"),
  ],
];

describe('.github/workflows/ci.yml', () => {
  it('structure meets the CI contract', () => {
    // Given
    const doc = aWorkflow();

    // When
    const violations = checkWorkflow(doc);

    // Then
    expect(violations).toEqual([]);
  });

  it.each(mutations)('rules detect breakage: %s', (_name, mutate) => {
    // Given
    const doc = aWorkflow();
    mutate(doc);

    // When
    const violations = checkWorkflow(doc);

    // Then
    expect(violations.length).toBeGreaterThanOrEqual(1);
  });

  it.each([
    ['an unpinned action', (doc: Dict) => (uploadStep(doc).uses = 'actions/upload-artifact@main')],
    [
      'a job that widens permissions',
      (doc: Dict) => (doc.jobs['build-test'].permissions = { contents: 'write' }),
    ],
    [
      'an upload path without playwright-report',
      (doc: Dict) => (uploadStep(doc).with.path = 'dist/'),
    ],
  ])('rules detect breakage: %s', (_name, mutate) => {
    // Given
    const doc = aWorkflow();
    mutate(doc);

    // When
    const violations = checkWorkflow(doc);

    // Then
    expect(violations.length).toBeGreaterThanOrEqual(1);
  });

  it.each<[string, (doc: Dict) => void, string]>([
    [
      'node-version 18',
      (doc) => (setupNodeStep(doc).with['node-version'] = 18),
      'setup-node: node-version must be 20',
    ],
    [
      'npm cache removed',
      (doc) => delete setupNodeStep(doc).with.cache,
      'setup-node: cache must be npm',
    ],
    [
      'checkout@v3',
      (doc) => (usesStep(doc, 'actions/checkout').uses = 'actions/checkout@v3'),
      'actions/checkout@v4',
    ],
    [
      'github-script@v6',
      (doc) => (usesStep(doc, 'actions/github-script').uses = 'actions/github-script@v6'),
      'actions/github-script@v7',
    ],
    [
      'setup-node@v3',
      (doc) => (setupNodeStep(doc).uses = 'actions/setup-node@v3'),
      'actions/setup-node@v4',
    ],
    [
      'upload-artifact@v3',
      (doc) => (uploadStep(doc).uses = 'actions/upload-artifact@v3'),
      'actions/upload-artifact@v4',
    ],
    [
      'checkout pinned to a SHA instead of @v4',
      (doc) => (usesStep(doc, 'actions/checkout').uses = `actions/checkout@${'a'.repeat(40)}`),
      'actions/checkout@v4',
    ],
    [
      'playwright install working-directory removed',
      (doc) =>
        delete stepRunning(doc, 'npx playwright install --with-deps chromium')['working-directory'],
      'playwright install: working-directory must be src/axon.E2ETests',
    ],
    [
      'playwright install working-directory changed',
      (doc) =>
        (stepRunning(doc, 'npx playwright install --with-deps chromium')['working-directory'] =
          'src/axon'),
      'playwright install: working-directory must be src/axon.E2ETests',
    ],
    [
      'upload path without test-results',
      (doc) => (uploadStep(doc).with.path = 'src/axon.E2ETests/playwright-report/'),
      'upload: path must include src/axon.E2ETests/test-results',
    ],
    [
      'upload path test-results-old/ instead of test-results/',
      (doc) =>
        (uploadStep(doc).with.path =
          'src/axon.E2ETests/playwright-report/\nsrc/axon.E2ETests/test-results-old/\n'),
      'upload: path must include src/axon.E2ETests/test-results',
    ],
    [
      'upload path not-playwright-report/ instead of playwright-report/',
      (doc) =>
        (uploadStep(doc).with.path =
          'src/axon.E2ETests/not-playwright-report/\nsrc/axon.E2ETests/test-results/\n'),
      'upload: path must include src/axon.E2ETests/playwright-report',
    ],
    [
      'upload path with an extra directory',
      (doc) =>
        (uploadStep(doc).with.path =
          'src/axon.E2ETests/playwright-report/\nsrc/axon.E2ETests/test-results/\nsrc/axon/dist/\n'),
      'upload: unexpected path src/axon/dist',
    ],
    [
      'clean-tree step missing',
      (doc) => {
        const list = steps(doc);
        list.splice(
          list.findIndex((s) => s.run === CLEAN_TREE),
          1,
        );
      },
      'steps: expected order',
    ],
    [
      'clean-tree step moved before build',
      (doc) => {
        const list = steps(doc);
        const [clean] = list.splice(
          list.findIndex((s) => s.run === CLEAN_TREE),
          1,
        );
        list.splice(
          list.findIndex((s) => s.run === 'npm run build'),
          0,
          clean,
        );
      },
      'steps: expected order',
    ],
    [
      'clean-tree step neutered with || true',
      (doc) => (stepRunning(doc, CLEAN_TREE).run = `${CLEAN_TREE} || true`),
      'steps: expected order',
    ],
    [
      'continue-on-error on the clean-tree step',
      (doc) => (stepRunning(doc, CLEAN_TREE)['continue-on-error'] = true),
      'continue-on-error is not allowed',
    ],
  ])('rules detect %s', (_name, mutate, expected) => {
    // Given
    const doc = aWorkflow();
    mutate(doc);

    // When
    const violations = checkWorkflow(doc);

    // Then
    expect(violations.some((violation) => violation.includes(expected))).toBe(true);
  });

  it('accepts node-version given as the string "20"', () => {
    // Given
    const doc = aWorkflow();
    setupNodeStep(doc).with['node-version'] = '20';

    // When
    const violations = checkWorkflow(doc);

    // Then
    expect(violations).toEqual([]);
  });
});
