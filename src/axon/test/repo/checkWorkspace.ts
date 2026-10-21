type Dict = Record<string, unknown>;

export type ReadJson = (relativePath: string) => Dict;

const STRICT_FLAGS = [
  'strict',
  'alwaysStrict',
  'noImplicitAny',
  'noImplicitThis',
  'strictBindCallApply',
  'strictFunctionTypes',
  'strictNullChecks',
  'strictPropertyInitialization',
  'useUnknownInCatchVariables',
];

const REQUIRED_SCRIPTS = [
  'build',
  'lint',
  'typecheck',
  'test:unit',
  'test:integration',
  'test:frontend',
  'test:e2e',
  'test:dev-smoke',
];

const REQUIRED_IGNORES = [
  'dist/',
  'coverage/',
  'test-results/',
  'playwright-report/',
  '.github/memorybank/test-runs/',
];

const BASE_TSCONFIG = 'tsconfig.base.json';

function isRecord(value: unknown): value is Dict {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function dirname(relativePath: string): string {
  const index = relativePath.lastIndexOf('/');
  return index === -1 ? '.' : relativePath.slice(0, index);
}

function resolveExtends(from: string, target: string): string {
  const parts = [...dirname(from).split('/'), ...target.split('/')];
  const resolved: string[] = [];
  for (const part of parts) {
    if (part === '..') resolved.pop();
    else if (part !== '.' && part !== '') resolved.push(part);
  }
  const joined = resolved.join('/');
  return joined.endsWith('.json') ? joined : `${joined}.json`;
}

export function checkTsconfig(file: string, read: ReadJson): string[] {
  const violations: string[] = [];
  const seen = new Set<string>();
  let current: string | undefined = file;
  let reachesBase = false;

  while (current && !seen.has(current)) {
    seen.add(current);
    const config = read(current);
    const options = isRecord(config.compilerOptions) ? config.compilerOptions : {};
    for (const flag of STRICT_FLAGS) {
      if (options[flag] === false) violations.push(`${current}: ${flag} must not be false`);
    }
    if (current === BASE_TSCONFIG) {
      reachesBase = true;
      if (options.strict !== true) violations.push(`${BASE_TSCONFIG}: strict must be true`);
      break;
    }
    current =
      typeof config.extends === 'string' ? resolveExtends(current, config.extends) : undefined;
  }

  if (!reachesBase)
    violations.push(`${file}: must extend ${BASE_TSCONFIG} directly or transitively`);
  return violations;
}

export function checkGitignore(content: string): string[] {
  const normalize = (line: string) => line.trim().replace(/^\//, '').replace(/\/$/, '');
  const lines = content.split('\n').map((line) => line.trim());
  const active = new Set(
    lines.filter((line) => line && !line.startsWith('#') && !line.startsWith('!')).map(normalize),
  );
  const negated = new Set(
    lines.filter((line) => line.startsWith('!')).map((line) => normalize(line.slice(1))),
  );

  const violations: string[] = [];
  for (const entry of REQUIRED_IGNORES) {
    const key = normalize(entry);
    if (!active.has(key)) violations.push(`.gitignore: ${entry} must be ignored`);
    if (negated.has(key)) violations.push(`.gitignore: ${entry} must not be re-included`);
  }
  return violations;
}

function scriptOf(pkg: Dict, name: string): string {
  const scripts = isRecord(pkg.scripts) ? pkg.scripts : {};
  return typeof scripts[name] === 'string' ? scripts[name] : '';
}

function workspaceIndex(command: string, workspace: string): number {
  const escaped = workspace.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return command.search(new RegExp(`-w ${escaped}(?![\\w./-])`));
}

export function checkRootScripts(pkg: Dict): string[] {
  const violations: string[] = [];
  for (const name of REQUIRED_SCRIPTS) {
    if (!scriptOf(pkg, name)) violations.push(`package.json: script "${name}" is required`);
  }

  const build = scriptOf(pkg, 'build');
  const order = ['src/axon.Shared', 'src/axon', 'src/axon.Frontend'].map((workspace) =>
    workspaceIndex(build, workspace),
  );
  const ordered = order.every((index, i) => index !== -1 && (i === 0 || index > order[i - 1]));
  if (!ordered) violations.push('package.json: build must run shared, then server, then frontend');
  return violations;
}

export function checkDevScript(
  rootPkg: Dict,
  workspaceDevScripts: Record<string, string>,
): string[] {
  const violations: string[] = [];
  const dev = scriptOf(rootPkg, 'dev');
  if (!/^concurrently\b/.test(dev)) violations.push('package.json: dev must use concurrently');
  if (!/(^|\s)--kill-others-on-fail(\s|$)/.test(dev)) {
    violations.push('package.json: dev must pass --kill-others-on-fail');
  }
  for (const [workspace, script] of Object.entries(workspaceDevScripts)) {
    if (!script) violations.push(`${workspace}: a dev script is required`);
    if (!new RegExp(`npm run dev -w ${workspace.replace(/[.]/g, '\\.')}(?![\\w./-])`).test(dev)) {
      violations.push(`package.json: dev must run the dev script of ${workspace}`);
    }
  }
  return violations;
}

export function checkNoPassWithNoTests(source: string, label: string): string[] {
  const enabled =
    /passWithNoTests['"]?\s*:\s*true/.test(source) ||
    /pass-with-no-tests['"]?\s*:\s*true/.test(source) ||
    /--pass(?:With|-with-)No-?Tests(?!=false)/i.test(source);
  return enabled ? [`${label}: passWithNoTests must not be enabled`] : [];
}

export function checkE2EScripts(pkg: Dict, configSource: string): string[] {
  const violations: string[] = [];
  const test = scriptOf(pkg, 'test');
  if (!/(^|\s)playwright test(\s|$)/.test(test)) {
    violations.push('src/axon.E2ETests/package.json: test script must run "playwright test"');
  }
  violations.push(
    ...checkNoPassWithNoTests(JSON.stringify(pkg.scripts ?? {}), 'src/axon.E2ETests/package.json'),
    ...checkNoPassWithNoTests(configSource, 'src/axon.E2ETests/playwright.config.ts'),
  );
  return violations;
}

function quoted(source: string): string[] {
  return [...source.matchAll(/'([^']+)'|"([^"]+)"/g)].map((match) => match[1] ?? match[2]);
}

export function extractIncludes(configSource: string): string[] {
  return [...configSource.matchAll(/\binclude:\s*\[([^\]]*)\]/g)].flatMap((match) =>
    quoted(match[1]),
  );
}

// Without an `include` override Vitest falls back to its default, which covers every suite glob extension.
export function checkVitestIncludes(
  configSource: string,
  projectDir: string,
  suiteGlobs: Record<string, string[]>,
): string[] {
  const includes = extractIncludes(configSource).map((pattern) => `${projectDir}/${pattern}`);
  if (includes.length === 0) return [];

  const violations: string[] = [];
  for (const [suite, globs] of Object.entries(suiteGlobs)) {
    for (const glob of globs) {
      if (!includes.includes(glob))
        violations.push(`${suite}: testFileGlob ${glob} has no matching Vitest include`);
    }
  }
  return violations;
}

export function checkEveryIncludeHasSuite(
  configSource: string,
  projectDir: string,
  suiteGlobs: Record<string, string[]>,
): string[] {
  const allGlobs = new Set(Object.values(suiteGlobs).flat());
  return extractIncludes(configSource)
    .map((pattern) => `${projectDir}/${pattern}`)
    .filter((glob) => !allGlobs.has(glob))
    .map((glob) => `vitest include ${glob} is not covered by any suite testFileGlobs`);
}
