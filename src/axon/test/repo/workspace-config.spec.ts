import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  checkDevScript,
  checkE2EScripts,
  checkEveryIncludeHasSuite,
  checkGitignore,
  checkNoPassWithNoTests,
  checkRootScripts,
  checkTsconfig,
  checkVitestIncludes,
  type ReadJson,
} from './checkWorkspace.js';

type Dict = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

function readText(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function readJson(relativePath: string): Dict {
  return JSON.parse(readText(relativePath)) as Dict;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

const TSCONFIGS = [
  'src/axon.Shared/tsconfig.json',
  'src/axon.Shared/tsconfig.build.json',
  'src/axon/tsconfig.json',
  'src/axon/tsconfig.build.json',
  'src/axon.Frontend/tsconfig.json',
  'src/axon.E2ETests/tsconfig.json',
];

const SERVER_CONFIG = 'src/axon/vitest.config.ts';
const FRONTEND_CONFIG = 'src/axon.Frontend/vite.config.ts';
const E2E_CONFIG = 'src/axon.E2ETests/playwright.config.ts';

function suiteGlobs(name: string): string[] {
  return readJson(`.github/scripts/test/suites/${name}.json`).testFileGlobs;
}

describe('root dev script (AC-7 crash propagation)', () => {
  const workspaceDevScripts = () => ({
    'src/axon': readJson('src/axon/package.json').scripts.dev ?? '',
    'src/axon.Frontend': readJson('src/axon.Frontend/package.json').scripts.dev ?? '',
  });

  it('uses concurrently with --kill-others-on-fail and runs both dev scripts', () => {
    // Given
    const rootPkg = readJson('package.json');

    // When
    const violations = checkDevScript(rootPkg, workspaceDevScripts());

    // Then
    expect(violations).toEqual([]);
  });

  it('keeps strictPort enabled in the frontend Vite config', () => {
    // Given
    const source = readText(FRONTEND_CONFIG);

    // When
    const enabled = /strictPort:\s*true/.test(source);

    // Then
    expect(enabled).toBe(true);
  });

  it.each<[string, (dev: string) => string, string]>([
    [
      '--kill-others-on-fail removed',
      (dev) => dev.replace('--kill-others-on-fail ', ''),
      'dev must pass --kill-others-on-fail',
    ],
    [
      'concurrently removed',
      (dev) => dev.replace(/^concurrently\b.*?"npm/, 'npm'),
      'dev must use concurrently',
    ],
    [
      'the frontend dev script dropped',
      (dev) => dev.replace(' "npm run dev -w src/axon.Frontend"', ''),
      'dev must run the dev script of src/axon.Frontend',
    ],
    [
      'the server dev script dropped',
      (dev) => dev.replace(' "npm run dev -w src/axon"', ''),
      'dev must run the dev script of src/axon',
    ],
  ])('rules detect %s', (_name, mutate, expected) => {
    // Given
    const rootPkg = clone(readJson('package.json'));
    rootPkg.scripts.dev = mutate(rootPkg.scripts.dev);

    // When
    const violations = checkDevScript(rootPkg, workspaceDevScripts());

    // Then
    expect(violations.some((violation) => violation.includes(expected))).toBe(true);
  });

  it('detects a workspace without a dev script', () => {
    // Given
    const rootPkg = readJson('package.json');

    // When
    const violations = checkDevScript(rootPkg, { ...workspaceDevScripts(), 'src/axon': '' });

    // Then
    expect(violations).toContain('src/axon: a dev script is required');
  });
});

describe('tsconfig strictness (AC-8)', () => {
  it.each(TSCONFIGS)('%s extends tsconfig.base.json with strict mode intact', (file) => {
    // Given
    const read: ReadJson = readJson;

    // When
    const violations = checkTsconfig(file, read);

    // Then
    expect(violations).toEqual([]);
  });

  it('tsconfig.base.json itself is strict', () => {
    // Given
    const read: ReadJson = readJson;

    // When
    const violations = checkTsconfig('tsconfig.base.json', read);

    // Then
    expect(violations).toEqual([]);
  });

  const files = (overrides: Record<string, Dict>): ReadJson => {
    const store: Record<string, Dict> = {
      'tsconfig.base.json': { compilerOptions: { strict: true } },
      'src/app/tsconfig.json': { extends: '../../tsconfig.base.json' },
      ...overrides,
    };
    return (file) => store[file];
  };

  it.each<[string, Record<string, Dict>, string]>([
    [
      'strict: false in the workspace config',
      {
        'src/app/tsconfig.json': {
          extends: '../../tsconfig.base.json',
          compilerOptions: { strict: false },
        },
      },
      'strict must not be false',
    ],
    [
      'noImplicitAny: false in the workspace config',
      {
        'src/app/tsconfig.json': {
          extends: '../../tsconfig.base.json',
          compilerOptions: { noImplicitAny: false },
        },
      },
      'noImplicitAny must not be false',
    ],
    [
      'strictNullChecks: false in an intermediate config',
      {
        'src/app/tsconfig.json': { extends: './tsconfig.shared.json' },
        'src/app/tsconfig.shared.json': {
          extends: '../../tsconfig.base.json',
          compilerOptions: { strictNullChecks: false },
        },
      },
      'strictNullChecks must not be false',
    ],
    [
      'no extends',
      { 'src/app/tsconfig.json': { compilerOptions: { strict: true } } },
      'must extend tsconfig.base.json',
    ],
    [
      'strict removed from the base',
      { 'tsconfig.base.json': { compilerOptions: {} } },
      'tsconfig.base.json: strict must be true',
    ],
  ])('rules detect %s', (_name, overrides, expected) => {
    // Given
    const read = files(overrides);

    // When
    const violations = checkTsconfig('src/app/tsconfig.json', read);

    // Then
    expect(violations.some((violation) => violation.includes(expected))).toBe(true);
  });

  it('accepts a transitive extends chain to the base', () => {
    // Given
    const read = files({
      'src/app/tsconfig.json': { extends: './tsconfig.shared.json' },
      'src/app/tsconfig.shared.json': { extends: '../../tsconfig.base.json' },
    });

    // When
    const violations = checkTsconfig('src/app/tsconfig.json', read);

    // Then
    expect(violations).toEqual([]);
  });
});

describe('.gitignore (AC-1 clean tree)', () => {
  const gitignore = () => readText('.gitignore');

  // Exit status 1 means none of the paths is ignored.
  const ignoredPaths = (paths: string[]): string[] => {
    try {
      const output = execFileSync('git', ['check-ignore', '--no-index', '--', ...paths], {
        cwd: repoRoot,
        encoding: 'utf8',
      });
      return output.split('\n').filter((line) => line !== '');
    } catch (error) {
      if ((error as { status?: number }).status === 1) return [];
      throw error;
    }
  };

  it('git ignores every path the build emits', () => {
    // Given
    const emitted = [
      'src/axon.Shared/dist/index.js',
      'src/axon.Shared/dist/index.d.ts',
      'src/axon/dist/server.js',
      'src/axon/dist/http/app.js',
      'src/axon.Frontend/dist/index.html',
      'src/axon.Frontend/dist/assets/index-abc123.js',
    ];

    // When
    const ignored = ignoredPaths(emitted);

    // Then
    expect(ignored).toEqual(emitted);
  });

  it('git check-ignore does not report a path that is not ignored', () => {
    // Given
    const notIgnored = ['src/axon/tsconfig.tsbuildinfo', 'src/axon/build/server.js'];

    // When
    const ignored = ignoredPaths(notIgnored);

    // Then
    expect(ignored).toEqual([]);
  });

  it('ignores build, coverage and test output', () => {
    // Given
    const content = gitignore();

    // When
    const violations = checkGitignore(content);

    // Then
    expect(violations).toEqual([]);
  });

  it.each([
    'dist/',
    'coverage/',
    'test-results/',
    'playwright-report/',
    '.github/memorybank/test-runs/',
  ])('rules detect %s removed', (entry) => {
    // Given
    const content = gitignore()
      .split('\n')
      .filter((line) => line.trim() !== entry)
      .join('\n');

    // When
    const violations = checkGitignore(content);

    // Then
    expect(violations).toContain(`.gitignore: ${entry} must be ignored`);
  });

  it('rules detect a negated entry', () => {
    // Given
    const content = `${gitignore()}\n!dist/\n`;

    // When
    const violations = checkGitignore(content);

    // Then
    expect(violations).toContain('.gitignore: dist/ must not be re-included');
  });
});

describe('root package.json scripts (AC-1, AC-9)', () => {
  it('defines every required script with build ordered shared, server, frontend', () => {
    // Given
    const pkg = readJson('package.json');

    // When
    const violations = checkRootScripts(pkg);

    // Then
    expect(violations).toEqual([]);
  });

  it.each([
    'build',
    'lint',
    'typecheck',
    'test:unit',
    'test:integration',
    'test:frontend',
    'test:e2e',
    'test:dev-smoke',
  ])('rules detect script %s removed', (name) => {
    // Given
    const pkg = clone(readJson('package.json'));
    delete pkg.scripts[name];

    // When
    const violations = checkRootScripts(pkg);

    // Then
    expect(violations).toContain(`package.json: script "${name}" is required`);
  });

  it.each<[string, string]>([
    [
      'frontend before server',
      'npm run build -w src/axon.Shared && npm run build -w src/axon.Frontend && npm run build -w src/axon',
    ],
    [
      'shared last',
      'npm run build -w src/axon && npm run build -w src/axon.Frontend && npm run build -w src/axon.Shared',
    ],
    ['frontend missing', 'npm run build -w src/axon.Shared && npm run build -w src/axon'],
    [
      'server confused with frontend',
      'npm run build -w src/axon.Shared && npm run build -w src/axon.Frontend',
    ],
  ])('rules detect build order: %s', (_name, build) => {
    // Given
    const pkg = clone(readJson('package.json'));
    pkg.scripts.build = build;

    // When
    const violations = checkRootScripts(pkg);

    // Then
    expect(violations).toContain('package.json: build must run shared, then server, then frontend');
  });
});

describe('empty suites fail (AC-9)', () => {
  const sources = (): [string, string][] => [
    [SERVER_CONFIG, readText(SERVER_CONFIG)],
    [FRONTEND_CONFIG, readText(FRONTEND_CONFIG)],
    ['src/axon/package.json', readText('src/axon/package.json')],
    ['src/axon.Frontend/package.json', readText('src/axon.Frontend/package.json')],
    ['src/axon.E2ETests/package.json', readText('src/axon.E2ETests/package.json')],
    [E2E_CONFIG, readText(E2E_CONFIG)],
    ['package.json', readText('package.json')],
  ];

  it.each(sources())('%s does not enable passWithNoTests', (label, source) => {
    // Given
    const content = source;

    // When
    const violations = checkNoPassWithNoTests(content, label);

    // Then
    expect(violations).toEqual([]);
  });

  it.each([
    ['config option true', 'test: { passWithNoTests: true }'],
    ['CLI flag', '"test": "vitest run --passWithNoTests"'],
    ['Playwright CLI flag', '"test": "playwright test --pass-with-no-tests"'],
    ['Playwright config key', "export default { 'pass-with-no-tests': true }"],
  ])('rules detect passWithNoTests as %s', (_name, source) => {
    // Given
    const content = source;

    // When
    const violations = checkNoPassWithNoTests(content, 'cfg');

    // Then
    expect(violations).toHaveLength(1);
  });

  it('allows passWithNoTests: false', () => {
    // Given
    const content = 'test: { passWithNoTests: false }';

    // When
    const violations = checkNoPassWithNoTests(content, 'cfg');

    // Then
    expect(violations).toEqual([]);
  });
});

describe('Playwright E2E empty suite (AC-8)', () => {
  const e2ePkg = () => clone(readJson('src/axon.E2ETests/package.json'));

  it('runs playwright test without pass-with-no-tests', () => {
    // Given
    const pkg = e2ePkg();
    const config = readText(E2E_CONFIG);

    // When
    const violations = checkE2EScripts(pkg, config);

    // Then
    expect(violations).toEqual([]);
  });

  it.each<[string, (pkg: Dict) => string, string]>([
    [
      '--pass-with-no-tests in the test script',
      (pkg) => {
        pkg.scripts.test = `${pkg.scripts.test} --pass-with-no-tests`;
        return readText(E2E_CONFIG);
      },
      'src/axon.E2ETests/package.json: passWithNoTests must not be enabled',
    ],
    [
      'passWithNoTests: true in the Playwright config',
      (pkg) => {
        void pkg;
        return `${readText(E2E_CONFIG)}\nexport const x = { passWithNoTests: true };`;
      },
      'src/axon.E2ETests/playwright.config.ts: passWithNoTests must not be enabled',
    ],
    [
      'a test script that does not run playwright',
      (pkg) => {
        pkg.scripts.test = 'echo skipped';
        return readText(E2E_CONFIG);
      },
      'test script must run "playwright test"',
    ],
    [
      'a missing test script',
      (pkg) => {
        delete pkg.scripts.test;
        return readText(E2E_CONFIG);
      },
      'test script must run "playwright test"',
    ],
  ])('rules detect %s', (_name, mutate, expected) => {
    // Given
    const pkg = e2ePkg();
    const config = mutate(pkg);

    // When
    const violations = checkE2EScripts(pkg, config);

    // Then
    expect(violations.some((violation) => violation.includes(expected))).toBe(true);
  });
});

describe('Vitest include patterns match the test runner suites (AC-9)', () => {
  const serverGlobs = () => ({ unit: suiteGlobs('unit'), integration: suiteGlobs('integration') });

  it('server projects match the unit and integration suite globs', () => {
    // Given
    const source = readText(SERVER_CONFIG);

    // When
    const violations = [
      ...checkVitestIncludes(source, 'src/axon', serverGlobs()),
      ...checkEveryIncludeHasSuite(source, 'src/axon', serverGlobs()),
    ];

    // Then
    expect(violations).toEqual([]);
  });

  it('server config declares both a unit and an integration include', () => {
    // Given
    const source = readText(SERVER_CONFIG);

    // When
    const includes = source.match(/\binclude:\s*\[/g) ?? [];

    // Then
    expect(includes).toHaveLength(2);
  });

  it('frontend config either uses the Vitest default or matches the frontend suite globs', () => {
    // Given
    const source = readText(FRONTEND_CONFIG);

    // When
    const violations = checkVitestIncludes(source, 'src/axon.Frontend', {
      frontend: suiteGlobs('frontend'),
    });

    // Then
    expect(violations).toEqual([]);
  });

  it('frontend suite globs only target test/spec ts and tsx files', () => {
    // Given
    const globs = suiteGlobs('frontend');

    // When
    const unsupported = globs.filter((glob) => !/\.(test|spec)\.tsx?$/.test(glob));

    // Then
    expect(unsupported).toEqual([]);
  });

  it.each([
    [
      'unit include renamed',
      "include: ['src/**/*.tests.ts']",
      'unit: testFileGlob src/axon/src/**/*.test.ts',
    ],
    [
      'integration include narrowed',
      "include: ['src/**/*.test.ts'] include: ['test/**/*.int.ts']",
      'integration: testFileGlob src/axon/test/**/*.spec.ts',
    ],
  ])('rules detect %s', (_name, source, expected) => {
    // Given
    const globs = serverGlobs();

    // When
    const violations = checkVitestIncludes(source, 'src/axon', globs);

    // Then
    expect(violations.some((violation) => violation.startsWith(expected))).toBe(true);
  });

  it('rules detect an include that no suite runs', () => {
    // Given
    const source = "include: ['src/**/*.test.ts'] include: ['e2e/**/*.ts']";

    // When
    const violations = checkEveryIncludeHasSuite(source, 'src/axon', serverGlobs());

    // Then
    expect(violations).toEqual([
      'vitest include src/axon/e2e/**/*.ts is not covered by any suite testFileGlobs',
    ]);
  });
});
