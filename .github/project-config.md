# Project Configuration

> **This file holds all project-specific configuration for the ADLC framework.**
> Agents read this file at startup to learn your tech stack, project structure, naming
> conventions, and tooling. The generic agents, instructions, and skills stay unchanged —
> you customize your project here.
>
> Replace every value below with your project's specifics. Sections marked _(optional)_
> can be removed if they don't apply.

---

## Project Identity

- **Project name**: `axon`
- **Description**: Real-time Planning Poker for agile teams: a facilitator shares a link, voters join with a name and estimate stories with Fibonacci cards.
- **Repository**: `https://github.com/sthirion/axon`

## Technology Stack

**Backend:** Node.js 20 / TypeScript / Express

**Frontend:** React 19+ / TypeScript 5+ / Vite

**Testing:** Playwright (E2E)

**Realtime:** Socket.IO (server and client), Zod schemas shared in `src/axon.Shared`

**Storage:** None. Games live in an in-memory `Map` in a single server instance.

**Auth:** None. Players get a random token per game (stored hashed on the server, kept in the browser's `localStorage`).

**DevOps:** GitHub Actions / Docker

## Ticket Tracker

- **Tracker**: GitHub Issues

> Tracker settings (org/project/area, labels, field keys, test plan/suite ids) live in
> `.github/scripts/tracker/tracker.config.json` — it is user-owned and never overwritten by
> `create-adlc`. Fill it in, then validate with `node .github/scripts/tracker/tracker.mjs auth-check`.
>
> For human/LLM context that doesn't belong in that machine config (suite descriptions,
> backlog URLs, team conventions), copy `.github/memorybank/project-info.template.md` to
> `project-info.md` and fill it in.

## Source Control

- **SCM**: GitHub
- **Organization / Owner**: `sthirion`
- **Repository**: `axon`

> Source control can be a different vendor than your ticket tracker (e.g. GitHub repos with
> Azure DevOps work items) — PR creation, review, and pipeline-status tools come from the
> `--scm` module, independent of `--tracker`.

## Stack Details

> Filled automatically by `create-adlc` from each selected module's `configFragment`.
> Safe to edit by hand after generation.

### Backend — Node.js / TypeScript

- **Test runner**: `node .github/scripts/test/test.mjs unit|integration --scope created|related` (suites in `.github/scripts/test/suites/unit.json` and `integration.json`). Requires `vitest` in `src/axon`, plus `@vitest/coverage-v8` for coverage.
- **Mutation test command** (StrykerJS, opt-in — see Mutation Testing): `npx stryker run --incremental --mutate "<changed source files, comma-separated>"`. Requires `@stryker-mutator/core` plus the runner plugin for your test framework as dev dependencies.
- **Source path**: `src/axon`
- **Unit tests**: `*.test.ts` next to the source file in `src/axon/src/`
- **Integration tests**: `*.spec.ts` in `src/axon/test/` (start the server on a random port, use `supertest` and `socket.io-client`)

### Frontend — React

- **Test runner**: `node .github/scripts/test/test.mjs frontend --scope created|related` (suite in `.github/scripts/test/suites/frontend.json`). Requires `vitest` in the frontend project, plus `@vitest/coverage-v8` for coverage.
- **Mutation test command** (StrykerJS, opt-in — see Mutation Testing): `npx stryker run --incremental --mutate "<changed source files, comma-separated>"`. Requires `@stryker-mutator/core` plus the runner plugin for your test framework as dev dependencies.
- **Source path**: `src/axon.Frontend`

### Testing — Playwright (E2E)

- **Test runner**: `node .github/scripts/test/test.mjs e2e --scope created` (suite in `.github/scripts/test/suites/e2e.json`; set `playwrightProject` there to pick a browser project). E2E coverage is not measured.
- **Source path**: `src/axon.E2ETests`

### Ticket Tracker — GitHub Issues

- Fill in `.github/scripts/tracker/tracker.config.json` (bug/story labels). Owner/repo are derived
  from the git remote automatically. Validate with `node .github/scripts/tracker/tracker.mjs auth-check`.
- Detailed human/LLM tracker reference (labels, milestones, issue-type mapping): copy
  `.github/memorybank/project-info.template.md` to `project-info.md` and fill it in.
- GitHub Issues has no test-plan concept — test-tracking agents fall back to labels/milestones
  for organizing test work; see the tracker skill for conventions.

### Source Control — GitHub

- Fill in **Owner / Organization** and **Repository** in the Source Control section above.
- PR creation, reviews, and workflow-run status use the GitHub MCP tools.

## Project Structure

Describe the folder layout so agents know where to place and find code.

npm workspaces; the root `package.json` lists every package under `src/`.

```text
src/
├── axon/                     # Express + Socket.IO server (also serves the built frontend)
├── axon.Shared/              # Zod schemas, Card type, event and state types (server + client)
├── axon.Frontend/            # React app
└── axon.E2ETests/            # Playwright end-to-end tests
```

### Backend layout

```text
axon/
├── src/
│   ├── domain/          # Pure game logic: state transitions, guards, results (no I/O)
│   ├── store/           # In-memory GameStore and the cleanup sweeper
│   ├── realtime/        # Socket.IO gateway: validate, call domain, broadcast state
│   ├── http/            # Express routes and middleware
│   └── server.ts        # Composition root and startup
└── test/                # Integration tests (*.spec.ts)
```

- Domain code never imports Express or Socket.IO.
- Every incoming event and request body is parsed with a schema from `axon.Shared`.

### Frontend layout

```text
axon.Frontend/src/
├── components/          # UI components (atoms, molecules, organisms)
├── pages/               # Route components: CreateGame, Game, NotFound
├── hooks/               # Custom hooks
├── services/            # REST client and Socket.IO client
├── store/               # Zustand store fed by game:state
└── types/               # Frontend-only types (shared types come from axon.Shared)
```

## Naming Conventions

- **Packages / folders**: `axon`, `axon.Shared`, `axon.Frontend`, `axon.E2ETests`
- **Files**: camelCase for modules (`gameStore.ts`), PascalCase for React components (`CardDeck.tsx`)
- **Variables / functions**: camelCase
- **Components / types**: PascalCase
- **Socket events**: `noun:verb` (`vote:cast`, `round:reveal`)
- **Test files**: `{subject}.test.ts(x)` (unit and component), `{subject}.spec.ts` (integration in `src/axon/test/`, E2E in `src/axon.E2ETests/`)
- **Branch naming**: `feature/{workItemId}-{short-description}` (kebab-case, 3–5 words)
- **Base branch**: `main`

## Authorization Model

Document your project's authorization rules so agents apply them consistently.

- There are no user accounts. Identity is a player token scoped to one game.
- Every socket event resolves the sender's player from the socket, then checks the role in the domain layer: facilitator-only events (`story:set`, `round:*`, `player:remove`) and voter-only events (`vote:cast`).
- Failed checks return the ack `{ ok: false, code: 'FORBIDDEN' }`; REST returns `403`.
- Vote values are never sent to any client before the reveal, other than the voter who owns the vote (via `vote:mine` to their own `player:<id>` room). Before the reveal `game:state` never contains vote values or results. In phase `revealed`, `game:state` carries every voter's `card` and `results` for everyone.
- Tokens are never put in URLs or logs.

## Local Development

- **Startup command**: `npm run dev` (root; starts the server and the Vite dev server)
- **Frontend dev server**: `npm run dev -w src/axon.Frontend` (proxies `/api` and `/socket.io` to the server)
- **Local auth**: none needed; open the game link in several browser profiles to simulate players
- **Local data**: in-memory; restarting the server ends all games

## Build & Test Commands

- **Install**: `npm ci` (root)
- **Build**: `npm run build` (root; builds shared, server and frontend)
- **Lint / type check**: `npm run lint`, `npm run typecheck`
- **Formatting**: `npm run format` fixes formatting; `npm run lint` fails on unformatted files.
- **Tests**: run through the test runner, never with a stack command:
  `node .github/scripts/test/test.mjs <suite> --scope created|related` with the suites `unit`, `integration`,
  `frontend`, `e2e` defined in `.github/scripts/test/suites/*.json` (edit those files to match your test
  projects). See `.github/skills/test-runner/SKILL.md`.

Agents run only the tests they wrote or changed (`--scope created`); `@code-review` runs the impacted tests
(`--scope related`). The full suites run in your pipeline.

Test and coverage output folders (e.g. `TestResults/`, `coverage/`, `test-results/`) are build
artifacts: add them to `.gitignore`. `@pr-create` stops and reports any that show up as untracked.

## Mutation Testing

- **Enabled**: no

Opt-in. Set to `yes` once the mutation tool for your stack is installed (see the **Mutation test
command** in the stack sections above). When enabled, `@code-backend` / `@code-frontend` run it on
the changed production code after their unit tests pass, kill surviving mutants, and report the
rest; `@test-review` judges the survivors. Add the tool's output folders (e.g. `StrykerOutput/`,
`.stryker-tmp/`, `reports/mutation/`, `target/pit-reports/`) to `.gitignore`.

## Terminal & Shell

- **Default shell**: zsh (macOS)
- Use the syntax matching your shell for all terminal commands.

## Project-Specific Conventions _(optional)_

Add any additional rules unique to your project that agents should always follow.
Consider putting detailed, file-scoped rules in a dedicated `*.instructions.md` file
under `.github/instructions/` with an `applyTo` glob, rather than listing them all here.

- Record architectural decisions in `.github/memorybank/`.
- Never commit secrets or environment-specific configuration values.
- Never write game data (names, stories, votes) to disk, a database or logs.
- Planning Poker specs live in `.github/memorybank/features/planning-poker/` (overview, requirements, design, tasks, stories). Requirement numbers in issues (for example "Req 5.3") refer to `requirements.md` there.
