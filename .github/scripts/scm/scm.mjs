#!/usr/bin/env node
// SCM dispatcher (design doc §4.2): parse args -> load target -> resolve auth -> load
// ./scm-adapter.mjs -> call the adapter method -> render output -> exit code. Mirrors
// tracker.mjs's structure; the git-derived origin remote is enough to resolve the SCM target
// (unlike the tracker, the SCM repo IS the git remote, so no config override is needed).
//
// Phase 2 added auth-check, pr-create, pr-ready. Phase 5 adds pr-fetch, pr-comment, and
// build-logs (external-PR review + pipeline debugging) — no capability gating needed, both
// adapters implement all commands.
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs, UsageError, requirePositiveIntId } from '../adlc-lib/args.mjs';
import { EXIT, emit, resolveSafePath } from '../adlc-lib/output.mjs';
import {
  detectGitRemoteUrl, parseGitHubRemote, parseAdoRemote, apiBaseForHost, detectTrackerType,
} from '../adlc-lib/config.mjs';
import { AuthRequiredError, resolveGitHubAuth, resolveAdoAuth } from '../adlc-lib/auth.mjs';
import { authHeader, request, requestJson, redactHeaders, HttpError } from '../adlc-lib/http.mjs';
import { runFixedCommand } from '../adlc-lib/exec.mjs';
import {
  parseNumstat, renderChangesSection, buildWorkItemLinks, assertModelBodyBudget, composeBody, PrBodyError,
} from '../adlc-lib/pr-body.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const KNOWN_COMMANDS = ['auth-check', 'pr-create', 'pr-ready', 'pr-fetch', 'pr-comment', 'build-logs'];

export async function run(argv, { cwd = process.cwd(), exec = runFixedCommand } = {}) {
  const [command, ...rest] = argv;

  if (!command || command === 'help' || command === '--help') {
    printHelp();
    return EXIT.OK;
  }

  if (!KNOWN_COMMANDS.includes(command)) {
    console.error(`Unknown command "${command}". Available: ${KNOWN_COMMANDS.join(', ')}.`);
    return EXIT.USAGE;
  }

  let adapter;
  try {
    adapter = await import(pathToFileURL(path.join(__dirname, 'scm-adapter.mjs')).href);
  } catch (err) {
    if (err.code === 'ERR_MODULE_NOT_FOUND') {
      console.error('No SCM module selected in create-adlc; scm commands are unavailable.');
      return EXIT.USAGE;
    }
    throw err;
  }

  const target = await resolveTarget(adapter.vendor, exec);
  if (!target) {
    console.error(
      adapter.vendor === 'ado'
        ? 'Could not determine the Azure DevOps org/project/repo — no "origin" git remote, or it is not an Azure DevOps remote.'
        : 'Could not determine the GitHub owner/repo — no "origin" git remote, or it is not a GitHub remote.'
    );
    return EXIT.USAGE;
  }

  let auth;
  try {
    auth = adapter.vendor === 'ado'
      ? await resolveAdoAuth({ org: target.org.replace(/^https?:\/\/dev\.azure\.com\//, '') })
      : await resolveGitHubAuth({ host: target.host });
  } catch (err) {
    if (err instanceof AuthRequiredError) {
      console.error(err.message);
      return EXIT.AUTH_REQUIRED;
    }
    throw err;
  }

  const ctx = { target, auth, http: { request, requestJson }, lib: { authHeader } };

  try {
    return await dispatch(command, rest, { adapter, ctx, cwd, exec });
  } catch (err) {
    if (err instanceof UsageError || err instanceof PrBodyError) {
      console.error(err.message);
      return EXIT.USAGE;
    }
    if (err instanceof HttpError) {
      console.error(err.message);
      return err.status === 404 ? EXIT.NOT_FOUND : EXIT.ERROR;
    }
    throw err;
  }
}

/** Resolves the SCM target purely from the git remote (§8.1/§8.2) — no config override, since
 * for the SCM (unlike the tracker) the repo being worked on IS the git remote. */
async function resolveTarget(vendor, exec) {
  const remoteUrl = await detectGitRemoteUrl(exec);
  if (vendor === 'ado') {
    const parsed = parseAdoRemote(remoteUrl);
    if (!parsed) return null;
    return { org: `https://dev.azure.com/${parsed.org}`, project: parsed.project, repo: parsed.repo };
  }
  const parsed = parseGitHubRemote(remoteUrl);
  if (!parsed) return null;
  const { rest, graphql } = apiBaseForHost(parsed.host);
  return { host: parsed.host, owner: parsed.owner, repo: parsed.repo, apiBase: rest, graphqlBase: graphql };
}

async function dispatch(command, args, deps) {
  if (command === 'auth-check') return runAuthCheck(deps, args);
  if (command === 'pr-create') return runPrCreate(deps, args);
  if (command === 'pr-ready') return runPrReady(deps, args);
  if (command === 'pr-fetch') return runPrFetch(deps, args);
  if (command === 'pr-comment') return runPrComment(deps, args);
  if (command === 'build-logs') return runBuildLogs(deps, args);
  throw new UsageError(`Unhandled command "${command}"`);
}

async function runAuthCheck({ adapter, ctx, cwd }, args) {
  const { values } = parseArgs(args, { out: { type: 'string' }, json: { type: 'boolean', default: false } });
  const result = await adapter.authCheck(ctx);
  const content = values.json ? JSON.stringify(result) : `Signed in to ${adapter.vendor} as ${result.identity}`;
  await emit(content, { out: values.out, cwd });
  return EXIT.OK;
}

async function runPrCreate({ adapter, ctx, cwd, exec }, args) {
  const { values } = parseArgs(args, {
    title: { type: 'string' },
    'body-file': { type: 'string' },
    'work-items': { type: 'string' },
    draft: { type: 'boolean', default: false },
    target: { type: 'string', default: 'main' },
    'dry-run': { type: 'boolean', default: false },
    json: { type: 'boolean', default: false },
    out: { type: 'string' },
  });

  if (!values.title) throw new UsageError('pr-create requires --title "<title>"');
  if (!values['body-file']) throw new UsageError('pr-create requires --body-file <file.md>');

  const branch = await getCurrentBranch(exec);
  if (!branch) throw new UsageError('Could not determine the current branch (git branch --show-current returned nothing).');
  if (!/^[\w./-]+$/.test(branch)) throw new UsageError(`Branch name looks unsafe, refusing: ${branch}`);
  if (branch === 'main' || branch === 'master') {
    throw new UsageError(`Refusing to create a PR from "${branch}" — switch to a feature branch first.`);
  }

  const modelBody = await readBodyFile(cwd, values['body-file']);
  assertModelBodyBudget(modelBody);

  const workItemIds = parseWorkItemIds(values['work-items']);

  const diffOutput = await getDiffNumstat(exec, values.target);
  const changesSection = renderChangesSection(parseNumstat(diffOutput));

  const trackerType = await detectTrackerType(path.join(__dirname, '..', 'tracker'));
  const { bodyLines, workItemRefs, warning } = buildWorkItemLinks({ trackerType, scmVendor: adapter.vendor, workItemIds });
  if (warning) console.log(warning);

  const body = composeBody({ modelBody, changesSection, linkLines: bodyLines });
  const createWorkItemIds = workItemRefs ? workItemRefs.map(Number) : [];

  const existing = await adapter.findPrForBranch(ctx, branch);

  if (values['dry-run']) {
    const dryHttp = makeDryRunHttp();
    const dryCtx = { ...ctx, http: dryHttp };
    if (existing) {
      await adapter.updatePr(dryCtx, existing.id, { title: values.title, body });
    } else {
      await adapter.createPr(dryCtx, {
        title: values.title, body, source: branch, target: values.target, draft: values.draft, workItemIds: createWorkItemIds,
      });
    }
    await emit(renderDryRun(dryHttp.calls), { out: values.out, cwd });
    return EXIT.OK;
  }

  let pr;
  let action;
  if (existing) {
    pr = await adapter.updatePr(ctx, existing.id, { title: values.title, body });
    action = 'updated';
  } else {
    pr = await adapter.createPr(ctx, {
      title: values.title, body, source: branch, target: values.target, draft: values.draft, workItemIds: createWorkItemIds,
    });
    action = 'created';
  }

  if (createWorkItemIds.length > 0) await adapter.linkWorkItems(ctx, pr.id, createWorkItemIds);

  const content = values.json
    ? JSON.stringify({ ...pr, action })
    : `PR #${pr.id}: ${pr.title} (${pr.isDraft ? 'draft' : 'ready'}, ${action})\n${pr.url}`;
  await emit(content, { out: values.out, cwd });
  return EXIT.OK;
}

async function runPrReady({ adapter, ctx, cwd, exec }, args) {
  const { values } = parseArgs(args, {
    pr: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
    json: { type: 'boolean', default: false },
    out: { type: 'string' },
  });

  let pr;
  if (values.pr) {
    const prId = requirePositiveIntId(values.pr, '--pr');
    pr = await adapter.getPrMeta(ctx, prId);
  } else {
    const branch = await getCurrentBranch(exec);
    if (!branch) throw new UsageError('Could not determine the current branch; pass --pr <id> explicitly.');
    pr = await adapter.findPrForBranch(ctx, branch);
    if (!pr) {
      console.error(`No open PR found for branch ${branch}.`);
      return EXIT.NOT_FOUND;
    }
  }

  if (values['dry-run']) {
    const dryHttp = makeDryRunHttp();
    await adapter.markReady({ ...ctx, http: dryHttp }, pr.id, { nodeId: pr.nodeId });
    await emit(renderDryRun(dryHttp.calls), { out: values.out, cwd });
    return EXIT.OK;
  }

  const updated = await adapter.markReady(ctx, pr.id, { nodeId: pr.nodeId });
  const content = values.json ? JSON.stringify(updated) : `PR #${updated.id ?? pr.id}: marked ready for review.`;
  await emit(content, { out: values.out, cwd });
  return EXIT.OK;
}

/** `pr-fetch` (design doc §5.2/§7.1): metadata + diff + existing review threads for external
 * PR review (`@code-review PR <id>`) — the PR's code isn't checked out locally, so this is
 * the only way the reviewer sees what changed. */
async function runPrFetch({ adapter, ctx, cwd }, args) {
  const [idArg, ...flagArgs] = args;
  const prId = requirePositiveIntId(idArg, 'pr-fetch <id>');
  const { values } = parseArgs(flagArgs, { out: { type: 'string' }, json: { type: 'boolean', default: false } });

  const result = await adapter.getPr(ctx, prId);
  if (values.json) {
    await emit(JSON.stringify(result), { out: values.out, cwd });
    return EXIT.OK;
  }
  await emit(renderPrFetch(prId, result), { out: values.out, cwd });
  return EXIT.OK;
}

/** `pr-comment` (never auto-approved, §7.3 — these are the human's/model's review findings,
 * not a read). `--input` is a JSON array of threads: `{ path?, line?, body }[]` (§4.2). */
async function runPrComment({ adapter, ctx, cwd }, args) {
  const [idArg, ...flagArgs] = args;
  const prId = requirePositiveIntId(idArg, 'pr-comment <id>');
  const { values } = parseArgs(flagArgs, {
    input: { type: 'string' },
    json: { type: 'boolean', default: false },
    out: { type: 'string' },
  });
  if (!values.input) throw new UsageError('pr-comment requires --input <threads.json>');

  const inputPath = resolveSafePath(cwd, values.input);
  let threads;
  try {
    threads = JSON.parse(await readFile(inputPath, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') throw new UsageError(`--input not found: ${values.input}`);
    if (err instanceof SyntaxError) throw new UsageError(`--input is not valid JSON: ${values.input}`);
    throw err;
  }
  if (!Array.isArray(threads) || threads.length === 0) {
    throw new UsageError('--input must be a non-empty JSON array of threads');
  }
  threads.forEach((thread, i) => {
    if (!thread || typeof thread.body !== 'string' || !thread.body.trim()) {
      throw new UsageError(`threads[${i}].body is required and must be a non-empty string`);
    }
  });

  await adapter.addThreads(ctx, prId, threads);
  const content = values.json
    ? JSON.stringify({ posted: threads.length })
    : `Posted ${threads.length} thread(s) to PR #${prId}.`;
  await emit(content, { out: values.out, cwd });
  return EXIT.OK;
}

/** `build-logs` (design doc §5.2/pipeline-debug skill): failed steps with a trimmed log tail
 * plus failed tests, so `@code-review`/pipeline-debug never has to page through a full log. */
async function runBuildLogs({ adapter, ctx, cwd }, args) {
  const [idArg, ...flagArgs] = args;
  const buildId = requirePositiveIntId(idArg, 'build-logs <buildId>');
  const { values } = parseArgs(flagArgs, {
    tail: { type: 'string', default: '200' },
    out: { type: 'string' },
    json: { type: 'boolean', default: false },
  });

  const result = await adapter.getBuildFailure(ctx, buildId, { tail: Number(values.tail) });
  if (values.json) {
    await emit(JSON.stringify(result), { out: values.out, cwd });
    return EXIT.OK;
  }
  await emit(renderBuildLogs(buildId, result), { out: values.out, cwd });
  return EXIT.OK;
}

async function getCurrentBranch(exec) {
  const result = await exec('git', ['branch', '--show-current']);
  return result?.stdout?.trim() || null;
}

/** The PR compares against the remote branch, so a local one that is behind or ahead gives the wrong file list. */
export async function resolveDiffBase(exec, target) {
  const remote = await exec('git', ['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${target}`]);
  return remote === null ? target : `origin/${target}`;
}

async function getDiffNumstat(exec, target) {
  const base = await resolveDiffBase(exec, target);
  const result = await exec('git', ['diff', '--numstat', `${base}...HEAD`]);
  if (result === null) {
    throw new UsageError(`git diff --numstat ${base}...HEAD failed — check that "${base}" exists and is reachable locally.`);
  }
  return result.stdout;
}

function parseWorkItemIds(raw) {
  if (!raw) return [];
  return raw.split(',').map((s) => s.trim()).filter(Boolean).map((s) => requirePositiveIntId(s, '--work-items'));
}

async function readBodyFile(cwd, bodyFile) {
  const dest = resolveSafePath(cwd, bodyFile);
  try {
    return await readFile(dest, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') throw new UsageError(`--body-file not found: ${bodyFile}`);
    throw err;
  }
}

/** A ctx.http replacement for `--dry-run` (D7): records the exact request instead of sending
 * it (Authorization redacted immediately, never held in memory unredacted past this point)
 * and returns a benign response so the adapter's own code path runs unchanged. Exported for
 * the §9.1 "token never appears in --dry-run output" test. */
export function makeDryRunHttp() {
  const calls = [];
  const stub = async (url, opts = {}) => {
    calls.push({ url, method: opts.method ?? 'GET', headers: redactHeaders(opts.headers ?? {}), body: opts.body });
    return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({}), text: async () => '' };
  };
  return { request: stub, requestJson: stub, calls };
}

export function renderDryRun(calls) {
  const lines = ['DRY RUN — no requests were sent:'];
  for (const call of calls) {
    lines.push('', `${call.method} ${call.url}`);
    for (const [key, value] of Object.entries(call.headers)) lines.push(`${key}: ${value}`);
    if (call.body) lines.push(call.body);
  }
  return lines.join('\n');
}

/** Renders `pr-fetch`'s `{ meta, diff, threads }` (§4.2) as compact markdown — mirrors the
 * tracker's `context.md` style (plain headings, a table-free thread list). */
export function renderPrFetch(prId, { meta, diff, threads } = {}) {
  const lines = [
    `# PR #${prId}: ${meta?.title ?? '(unknown title)'} (${meta?.isDraft ? 'draft' : 'ready'})`,
    meta?.url ?? '',
    '',
    '## Description',
    '',
    meta?.body?.trim() || '(no description)',
    '',
    '## Changed files',
    '',
    diff?.trim() || '(no changes reported)',
    '',
    `## Threads (${threads?.length ?? 0})`,
    '',
  ];
  for (const thread of threads ?? []) {
    const where = thread.path ? `${thread.path}:${thread.line ?? '?'}` : 'general';
    lines.push(`- **${where}** — ${thread.author ?? 'unknown'}: ${thread.body}`);
  }
  return lines.join('\n');
}

/** Renders `build-logs`'s `{ status, failedSteps, tests }` (§4.2) as compact markdown — only
 * the failed steps' trimmed tail and failed tests, never the full log. */
export function renderBuildLogs(buildId, { status, failedSteps, tests } = {}) {
  const lines = [`# Build #${buildId}: ${status ?? 'unknown'}`, ''];
  for (const step of failedSteps ?? []) {
    lines.push(`## Failed step: ${step.name}`, '', '```', step.logTail, '```', '');
  }
  if ((tests ?? []).length > 0) {
    lines.push('## Failed tests', '');
    for (const t of tests) lines.push(`- **${t.name}**: ${t.error}`);
  }
  return lines.join('\n');
}

function printHelp() {
  console.log(`scm.mjs — SCM-neutral pull request commands

Usage:
  node scm.mjs auth-check [--json]
  node scm.mjs pr-create --title "<t>" --body-file <f.md> [--work-items 1,2] [--draft] [--target main] [--dry-run] [--json]
  node scm.mjs pr-ready [--pr <id>] [--dry-run] [--json]
  node scm.mjs pr-fetch <id> [--out <file>] [--json]
  node scm.mjs pr-comment <id> --input <threads.json> [--json]
  node scm.mjs build-logs <buildId> [--tail 200] [--out <file>] [--json]
`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  run(process.argv.slice(2)).then((code) => process.exit(code ?? 0)).catch((err) => {
    console.error(err.message ?? String(err));
    process.exit(EXIT.ERROR);
  });
}
