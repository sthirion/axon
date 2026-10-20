// playwright runner adapter for scripts/test/test.mjs. Provided by the playwright module. No imports:
// it sits next to the dispatcher only after create-adlc assembles the target, so everything it needs
// comes in through `ctx`. Runs Playwright's own JS entry with the current node (no npx shim) and reads
// the JSON reporter file. E2E coverage is not measured, and impacted tests cannot be derived from
// changed source, so `related` runs the same spec files as `created`.

export const id = 'playwright';

export const filterHint = 'The filter is a test-title regex (playwright --grep); tags work, e.g. --filter "@smoke".';

const FILTER_RE = /^[\w.~=|!(), @:-]+$/;
const PROJECT_RE = /^[\w. -]+$/;
const slash = (p) => String(p).replace(/\\/g, '/');

export async function selectTests(ctx, suite, scope, changed) {
  const specs = [...changed.files.keys()].filter((f) => ctx.matches(suite.testFileGlobs, f));
  const note = scope === 'related' ? 'playwright cannot derive impacted specs from changed source; only changed spec files run' : '';
  return { files: specs, selectedCount: specs.length, unit: 'spec files', note };
}

export function buildCommand(ctx, suite, selection, opts) {
  if (opts.filter && !FILTER_RE.test(opts.filter)) throw new Error('--filter contains characters that are not allowed');
  if (suite.playwrightProject && !PROJECT_RE.test(suite.playwrightProject)) throw new Error('suite "playwrightProject" contains characters that are not allowed');
  const prefix = `${slash(suite.project).replace(/\/+$/, '')}/`;
  const files = (selection.files ?? []).map((f) => (slash(f).startsWith(prefix) ? slash(f).slice(prefix.length) : slash(f)));
  const results = slash(ctx.resultsDir);
  const args = [suite.bin ?? 'node_modules/@playwright/test/cli.js', 'test', ...files, '--reporter=json', `--output=${results}/artifacts`];
  if (suite.playwrightProject) args.push(`--project=${suite.playwrightProject}`);
  if (opts.filter) args.push(`--grep=${opts.filter}`);
  const shown = [...files, opts.filter ? `--grep ${opts.filter}` : ''].filter(Boolean).join(' ');
  return {
    command: process.execPath,
    args,
    cwd: `${slash(ctx.cwd)}/${prefix}`.replace(/\/+$/, ''),
    env: { PLAYWRIGHT_JSON_OUTPUT_NAME: `${results}/results.json` },
    filterShown: shown,
  };
}

function walk(suites, chain, out) {
  for (const s of suites ?? []) {
    const here = s.title && s.title !== s.file ? [...chain, s.title] : chain;
    for (const spec of s.specs ?? []) {
      for (const t of spec.tests ?? []) out.push({ file: spec.file ?? s.file, title: [...here, spec.title].join(' > '), test: t });
    }
    walk(s.suites, here, out);
  }
}

/** Playwright json report -> counts + failures. flaky (passed on retry) counts as passed.
 * Report-level errors (config or load failures) with no tests count as one failure each, except
 * "No tests found", which is "nothing ran" and must not look like a failing test. */
export function parsePlaywrightJson(json) {
  const all = [];
  walk(json?.suites, [], all);
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  const failures = [];
  for (const { file, title, test } of all) {
    if (test.status === 'unexpected') {
      failed += 1;
      const last = (test.results ?? []).at(-1);
      failures.push({ name: `${file} > ${title}`, message: last?.error?.message ?? last?.errors?.[0]?.message ?? '' });
    } else if (test.status === 'skipped') skipped += 1;
    else passed += 1;
  }
  if (all.length === 0) {
    for (const e of json?.errors ?? []) {
      if (/No tests found/.test(e.message ?? '')) continue;
      failed += 1;
      failures.push({ name: 'playwright', message: e.message ?? '' });
    }
  }
  return { passed, failed, skipped, total: passed + failed + skipped, failures };
}

export async function parseResults(ctx) {
  const found = await ctx.findFiles(ctx.resultsDir, 'results.json');
  if (!found.length) return null;
  try {
    return parsePlaywrightJson(JSON.parse(await ctx.readAbs(found[0])));
  } catch {
    return null;
  }
}
