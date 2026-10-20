# ADLC — Agent Development Lifecycle

This guide explains how to use the multi-agent Copilot setup: when to invoke each agent,
recommended workflows, and best practices.

> **New to ADLC?** Start by filling in [project-config.md](project-config.md) with your
> project's tech stack, structure, naming conventions, and ticket tracker. The generic
> agents, instructions, and skills read that file to adapt to your project.

## Prerequisites

The agents rely on a few MCP servers. Which ones you need depends on your project's
ticket tracker and workflow (configured in [project-config.md](project-config.md)).

`create-adlc` generates `.vscode/mcp.json` with the servers for your selected modules
(tracker, SCM, Playwright) plus Context7, and `.vscode/extensions.json` with the recommended
VS Code extensions. Server names match the tool prefixes the agents use (`ado/`, `github/`,
`playwright/`, `context7/`) — don't rename them. Start them via **MCP: List Servers** in the
Command Palette. If either file already existed, the CLI left it untouched and printed the
entries to merge.

### Ticket Tracker MCP Server

Several agents (`@requirements`, `@feature`, `@story`, `@code-review`, `pr-create`)
read work items; only `@requirements`, `@feature`, `pr-create`, `@drift`, and `@assistant` can write
them. The generated `.vscode/mcp.json` includes your tracker's server (Azure DevOps prompts
for the organization name on first start).

### Context7 MCP Server (optional)

Used by implementation and planning agents to fetch up-to-date library documentation.
A soft dependency — agents function without it.

### Tool approvals for autonomous runs

`@story` runs every phase without pausing, so tool confirmations would stall it.
`create-adlc` writes terminal auto-approve rules to `.vscode/settings.json`
(`chat.tools.terminal.autoApprove`): the git commands `@story`, `@feature`, and
`pr-create` use, the build and mutation-test commands of your selected stack, and the test
runner (`test.mjs`, scopes `created` and `related` only). If
`.vscode/settings.json` already existed, the CLI leaves it untouched and prints the rules
to merge yourself.

MCP tools (tracker, SCM) are approved per tool, not via settings. On the first
`@story` run, choose **Always allow** (workspace) for the tracker and SCM tools it calls,
or pre-approve them with **Chat: Manage Tool Approval**. Avoid Autopilot mode for
`@story`: it answers questions automatically, including the tracker-update approval.

---

## Overview

ADLC uses a **decentralized, multi-agent architecture** — [specialists beat a single
generalist assistant](https://blog.qa-redefined.com/blog/specialist-agents-vs-generalists).
Each agent is specialized for a specific phase of development, uses a model tuned to that
task, and has a minimal set of tools scoped to its responsibilities. See
[Meet ADLC](https://blog.qa-redefined.com/blog/ai-engineering-methodology) for the full
Define → Architect → Instruct, Execute → Review → Refine methodology behind this design.

Agents hand off to each other via **workflow buttons** that appear at the end of a
response. You do not need to manually switch — click the button to continue in the right
context. The exception is `@story`, which runs autonomously: it invokes the specialist and
review agents as **subagents** and only stops at its human checkpoints.

---

## Agent Reference

### Visible Agents (available in the agent picker)

| Agent | Purpose |
| --- | --- |
| `@assistant` | General-purpose fallback. Full-stack help, quick questions, anything that doesn't fit a specialist. |
| `@requirements` | Fetch and analyze user stories. Extract acceptance criteria, surface ambiguities, refine stories, generate BDD scenarios and a test awareness matrix. Can create/update stories in the tracker. |
| `@feature` | Full feature lifecycle orchestrator. Creates branches, initializes feature workspaces, PRD → Design → Tasks → Implementation handoffs. |
| `@story` | Autonomous user story orchestrator. Delegates each phase (requirements, implementation, tests, review, PR) to subagents, gates each with a review agent, and only pauses at human checkpoints. Auto-detects scope (backend / frontend / full-stack). `--dev` / `--qe` run half the flow. |
| `@plan` | Read-only architecture and technical design. ADRs, patterns, API shapes. Never writes code. |
| `@drift` | Keeps the agents in step with the codebase. Detects new, removed, and upgraded libraries, discovers new patterns in the changes since the last scan, and tracks deprecated patterns still in use. Records human decisions in the pattern registry and creates a tracker story per decision to update the skills (and optionally migrate existing code). |
| `@code-backend` | Implement backend services, endpoints, mappers, and unit tests. |
| `@code-frontend` | Implement frontend components, hooks, services, and unit tests. |
| `@test-api` | Write integration tests and additional unit tests. |
| `@test-e2e` | Write Playwright E2E tests using persona-based auth. |
| `@code-review` | Code-quality review: security, SOLID, naming, and test *code* quality. Runs the full test suites to catch regressions (its only terminal use). Never edits files. Also runs as `@story`'s code gate. |
| `@test-review` | Read-only test-adequacy review: were the right tests written — every changed behavior and AC covered by positive, negative, boundary, and auth tests with meaningful assertions (not just coverage). Judges surviving mutants when mutation testing is enabled. Also runs as `@story`'s test gate. |

### Quality-Gate Agents (hidden — invoked by `@story` as subagents)

| Agent | Purpose |
| --- | --- |
| `@requirements-review` | Rates `@requirements` output (testable AC, negative cases, complete Test Awareness Matrix); recommends approve / refine / escalate. |

### Other Agents

| Agent | Purpose |
| --- | --- |
| `pr-create` | Commits and pushes the story branch, then creates the pull request with a structured description and work item links. Invoked by `@story` or via handoff from `@code-review`. |

Model assignments live in [agents/model-config.json](agents/model-config.json).

---

## Recommended Workflows

### User Story Workflow

Use this when working on a single, well-scoped story.

```text
@story /start <storyId> [--dev | --qe]   # fetch story, create branch, analyse, plan
  ↓ you confirm the Story Plan (the only routine pause)
requirements → requirements-review        # each step runs as a subagent;
code-backend / code-frontend               # REFINE verdicts loop back (max 2 retries)
  → code-review (gate) + test-review (unit)
test-api / test-e2e → test-review (integration/E2E)
code-review (test code)
pr-create                                  # commit, push, PR, link work item
```

`--dev` stops after a draft PR; `--qe` (usually via `/resume <storyId> --qe`) picks up
with tests and marks the PR ready. `@story` pauses only for: approving a tracker story update
(only when the refined acceptance criteria differ from the tracker; it shows the assumptions and
open questions behind them), a scope that is still undeterminable after requirements, a dirty
working tree, blocking open questions, and review gate escalations. A story that fails the
Clarity Gate does not pause: it goes straight into requirements.

### Full Feature Workflow

Use this when starting any new feature from a tracker story.

```text
@requirements <work item ID>
  ↓ [Start Feature Workflow]
@feature /start feature <name>
  ↓ [Architecture Deep Dive] (optional)
@plan
  ↓ [Begin Backend Implementation]
@code-backend
  ↓ [Generate Integration Tests]
@test-api
  ↓ [Send to Code Review]
@code-review
  ↓ [Create Pull Request]  → pr-create (auto)
```

Each `→` button appears at the end of the agent response. Context from the previous step
is passed automatically.

### Quick Implementation Workflow

Use this when requirements are already clear and you just need to build.

```text
@code-backend  (or @code-frontend)
  ↓ [Generate Integration Tests] / [Generate E2E Tests]
@test-api  /  @test-e2e
  ↓ [Send to Code Review]
@code-review
  ↓ [Create Pull Request]
```

### Design-First Workflow

Use this when you need to think through the architecture before writing code.

```text
@plan  (describe the problem)
  ↓ [Begin Backend Implementation]
@code-backend
```

---

## When to Use Each Agent

- **`@requirements`** — you have a work item ID and need to understand what to build,
  surface ambiguities, generate BDD scenarios and a test awareness matrix, or create/update
  a story or bug in the tracker.
- **`@story`** — you're working on a single story and want full orchestration from branch
  to PR, with automatic scope detection. Resume mid-flight with `@story /resume <storyId>`.
- **`@feature`** — you're starting a feature from scratch and want a PRD, technical design,
  and task breakdown before writing code.
- **`@plan`** — you need an ADR or architecture decision, or a read-only deep-dive into
  existing patterns before committing to an approach.
- **`@code-backend`** — implementing a service, endpoint, mapper, or unit test in the
  backend project.
- **`@code-frontend`** — implementing a component, hook, service, or type in the frontend
  project.
- **`@test-api`** — integration tests covering a new or changed endpoint, plus unit tests.
- **`@test-e2e`** — Playwright tests for a user journey with persona-based auth.
- **`@code-review`** — a structured quality/security review before a PR, or posting review
  threads to an existing PR.
- **`@assistant`** — a quick question that doesn't map to a specialist, or full-stack help
  in a single session.
- **`@drift`** — after merges (`/scan`) to catch new or upgraded libraries, new patterns, and
  stale skills; to register a pattern you noticed (`/register <description>`); or when the
  team retires an approach (`/deprecate <name>`).

---

## Branch Naming Convention

**Format**: `feature/{storyId}-{short-description}`

- Base branch: `main`
- Description: kebab-case, 3-5 words max

Create a branch with the correct convention:

```text
@feature /branch <storyId> <short-description>
```

`@feature` fetches the story title from the tracker, creates the branch from `main`, and
checks it out.

---

## Best Practices

### Starting a session

- Always start specialist agents with a concrete task: a work item ID, a file name, or a
  clear description.
- Bad: `@code-backend add some tests`
- Good: `@code-backend implement the status update endpoint, see TASK-007`

### Using handoffs

- In the manual workflows, let handoff buttons do the context transfer - don't copy-paste output between agents.
- Most handoffs pre-fill the next agent's prompt so you can edit it before sending.
  `Create Pull Request` (from `@code-review`) sends immediately when clicked.
- `@story` does not use handoffs for its own phases: it runs specialist agents as subagents and passes context through the story plan. Its only button, `Refine Requirements Interactively`, is an always-available manual override — click it any time you want to work through requirements with `@requirements` yourself instead of letting `@story` run Phase 1 autonomously. It is not tied to the Clarity Gate: that gate never pauses the run, it just routes a flaky story into a real (not rubber-stamp) requirements review.

### Keeping reviews clean

- Run `@code-review` before every PR, even for small changes.
- `@code-review` is intentionally **read-only** — its feedback won't introduce unintended
  changes.
- Address all **MUST** items before creating a PR.

### Instruction files

The `.github/instructions/` folder contains language and domain-specific rules referenced
by the agents. You do not need to reference them manually — the agents load them via
`applyTo` globs. See
[The Three Layers of Agent Knowledge](https://blog.qa-redefined.com/blog/skills-instructions-scripts)
for when to use an instruction file vs. a skill vs. a script vs. the memory bank.

| File | Referenced by |
| --- | --- |
| `code-write.instructions.md` | `@code-backend`, `@code-frontend` |
| `test-create.instructions.md` | `@test-api`, `@test-e2e` |
| `pr-create.instructions.md` | `pr-create` |

The files above ship with every project (`core/instructions/`). Your **selected modules**
add their own — e.g. a backend module contributes `code-<language>.instructions.md`, a test
module contributes `test-e2e.instructions.md`. Check `.github/instructions/` after generation to see exactly
what's installed for your stack.

### Project context

All agents read [project-config.md](project-config.md) as the single source of truth for
tech stack, structure, naming, ticket tracker identifiers, and build/test commands. Update
that file when your project changes — not the agents.

### Security

- `@code-review` flags OWASP Top 10 issues: treat these as blockers.
- Never commit secrets. Replace generated connection strings or tokens with config keys.
- Authorization failures should return 403 by default (projects may override in `project-config.md`).

---

## Agent Model Configuration

[agents/model-config.json](agents/model-config.json) is the source of truth for which model
each agent uses. Each `.agent.md` file carries a `model:` field in its YAML frontmatter that
should match the config. See
[Match the Model to the Job](https://blog.qa-redefined.com/blog/model-selection-matching-model-to-job)
for why orchestrators, implementers, and PR formatting each use a different model.

- List the current model in every agent file:
  ```sh
  node .github/scripts/agents/set-agent-models.mjs
  ```
- Change a model in `model-config.json` (a tier or a per-agent `primary`), then apply it:
  ```sh
  node .github/scripts/agents/set-agent-models.mjs --set          # write changes
  node .github/scripts/agents/set-agent-models.mjs --set --dry-run # preview only
  ```
- Validate that no agent references a non-approved model (CI gate):
  ```sh
  node .github/scripts/agents/set-agent-models.mjs --strict
  ```
- The `approvedModels` array documents the models allowed in your org; keep it in sync with
  your GitHub Copilot model settings.

---

## Maintenance Scripts

The `.github/scripts/` folder holds zero-dependency Node scripts (run with `node`) that keep
the framework consistent as your codebase evolves. The drift scripts read
[scripts/drift/drift.config.json](scripts/drift/drift.config.json) — set `roots` to your source folders;
`@drift` maintains the pattern detectors and skill symbol references. See
[Your Agent's Rules Are Probably Wrong](https://blog.qa-redefined.com/blog/drift-detection-keeping-agent-rules-accurate)
for why skills go stale as the codebase evolves and how this validation loop catches it.

| Script | Purpose |
| --- | --- |
| `set-agent-models.mjs` | Sync agent `model:` frontmatter with `model-config.json`. |
| `scan-drift.mjs` | Compare dependency manifests (npm, NuGet, Maven, Gradle) with the last scan, count registered patterns (with `git blame` dates), and update `memorybank/patterns/registry.md`. The first run records a baseline. |
| `validate-skill-examples.mjs` | Verify skill examples reference types/paths/packages that still exist, and flag skills teaching Deprecated or Removed patterns and libraries. |

```sh
node .github/scripts/drift/scan-drift.mjs                        # or --json for @drift, --dry-run to preview
node .github/scripts/drift/validate-skill-examples.mjs           # exit code = issues found (CI gate)
node .github/scripts/drift/validate-skill-examples.mjs --skill new-component
```

### Tracker and SCM scripts

Agents read and write work items and pull requests through two scripts, so every call has the
same shape and returns a short summary. The vendor (Azure DevOps or GitHub) comes from the module
you selected; `scripts/tracker/tracker.config.json` holds your org, project and labels and is
never overwritten.

```sh
node .github/scripts/tracker/tracker.mjs auth-check              # also fetch, search, create, update, comment, link
node .github/scripts/scm/scm.mjs pr-create --title "<t>" --body-file <f.md> --work-items 7
```

Batch `create` is two steps: a `--dry-run` preview prints a hash, then `--expect-hash <hash>`
creates exactly what you approved.

---

## Test Runner

Agents run tests with one script, so every run uses the same flags and returns the same short
summary instead of raw logs.

```sh
node .github/scripts/test/test.mjs <suite> --scope created|related [--coverage] [--filter "<expr>"]
```

- **Suites** (`unit`, `integration`, `frontend`, `e2e`) are JSON files in `.github/scripts/test/suites/`
  that your selected modules provide. They are yours to edit and `create-adlc` never overwrites them.
  Each names a runner adapter (`dotnet`, `vitest`, `playwright`) in `.github/scripts/test/runners/`.
  `testFileGlobs` and `sourceGlobs` take `*`, `**` and `?`; start a glob with `!` to exclude paths
  (for example `!src/App.Tests/Integration/**`). A new test file that no glob matches is not run by
  `--scope created`, so keep the globs broad.
- **`--scope created`**: only the tests added or modified by the current work. Implementers
  (`@code-backend`, `@code-frontend`, `@test-api`, `@test-e2e`) run this and nothing else.
- **`--scope related`**: `created` plus the tests impacted by the changed source. `@code-review` runs this
  as its regression check. There is no `--scope all`: whole suites are your pipeline's job, and the
  command always prompts a human.
- **Coverage** is reported for the changed lines only and never gates anything. E2E coverage is not measured.
- **Exit codes**: 0 pass, 1 failures, 2 usage or config, 3 runner missing, 4 nothing ran, 5 timeout.

Stacks without a runner yet (Java/Spring, Node/TypeScript backends) keep their stack test commands
in `project-config.md` and their auto-approve rules until a runner exists. Details for agents:
[skills/test-runner/SKILL.md](skills/test-runner/SKILL.md).

---

## Project-Specific Prompts (adapt per project)

Your **selected modules** also contribute slash-command prompts (in `.github/prompts/`) tailored to
their stack. They use placeholder names (e.g. `MyApp`, `ExampleService`) and **must be adapted to
your project's paths and domain** before use.

| Item | What to adapt |
| --- | --- |
| `prompts/create-net-unit-test.prompt.md` (C# module) | Test scaffold — replace placeholder namespaces and dependencies. |
| `prompts/format-stub.prompt.md` | WireMock stub paths and service names. |

