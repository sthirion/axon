# Story Plan: 1 — Project setup: workspaces, walking skeleton and CI

## Branch

`feature/1-project-setup-walking-skeleton`

## Context

`.github/memorybank/stories/1/context.md` — story text, comments, and related work items (snapshot; do not edit). Refined AC live below, not there.

Specs: `.github/memorybank/features/planning-poker/design.md` (Architecture, Project Layout, Technology Stack, Security) and `.github/project-config.md` (structure, commands, test suites).

## Scope

Full-stack — creates the server (`src/axon`), shared package (`src/axon.Shared`), React app (`src/axon.Frontend`) and Playwright project (`src/axon.E2ETests`), plus the CI workflow. Touches `src/`, so it cannot be chore.

## Summary

Scaffold the npm-workspaces monorepo with a walking skeleton: an Express + Socket.IO server that serves `/healthz` and the built React shell with `helmet` headers, a shared Zod package, a Vite React app, Playwright, one smoke test per suite, lint/type check, and a GitHub Actions workflow. No game features.

## Acceptance Criteria

1. Given a fresh clone, when I run `npm ci` and `npm run build` at the root, then all workspaces build without errors.
2. Given the server is running, when I call `GET /healthz`, then it returns `200`.
3. Given the server is running, when I open `/` in a browser, then the React app shell loads (app name and an empty home page).
4. Given the server is running, when any response is returned, then security headers from `helmet` are present, including a Content-Security-Policy.
5. Given `npm run dev` at the root, then the server and the Vite dev server start, and Vite proxies `/api` and `/socket.io` to the server.
6. Given the test runner, when I run the `unit`, `integration`, `frontend` and `e2e` suites, then each finds and passes at least one smoke test.
7. `npm run lint` and `npm run typecheck` pass with TypeScript `strict` enabled in every workspace.
8. Given a pull request to `main`, then a GitHub Actions workflow runs install, lint, type check, build and all four test suites, and fails the check if any step fails.

## Assumptions

From `@requirements` (attempt 3):

### Shared contract and server behaviour

- **A-1 Health contract:** `@axon/shared` exports `healthResponseSchema = z.object({ status: z.literal('ok') }).strict()` and `HealthResponse`. The server handler returns it with `200`, `application/json` and `Cache-Control: no-store`.
- **A-2 CSP** (exact value):

  ```text
  default-src 'self'; base-uri 'self'; connect-src 'self'; font-src 'self' data:;
  form-action 'self'; frame-ancestors 'none'; img-src 'self' data:; object-src 'none';
  script-src 'self'; script-src-attr 'none'; style-src 'self' 'unsafe-inline'
  ```

  - `upgrade-insecure-requests` is off.
  - `frameguard: { action: 'deny' }`.
  - `x-powered-by` is disabled.
  - helmet is the first middleware.
- **A-4 App factory:** `createApp({ staticDir, extendRoutes? })`.
  - `extendRoutes` mounts test-only routes such as `/__test/throw` before the 404 and error handlers. Production never passes it.
  - `server.ts` passes `STATIC_DIR` or the resolved `src/axon.Frontend/dist`.
  - If the folder is missing, no SPA fallback is mounted.
- **A-13 Not-found view:** a minimal client "Page not found" route; no game routes.

### Workspaces, packages and frontend

- **A-5 Package names:** `@axon/server`, `@axon/shared`, `@axon/frontend`, `@axon/e2e-tests`. Folder names are unchanged; workspace commands use `-w src/axon` and so on.
- **A-6 Type check without a build:** `typecheck` must not need `dist`; use project references, or point the shared package's types at its source. The root `build` builds shared, then server, then frontend. The E2E workspace has `typecheck` only.
- **A-9 Shared contract use:**
  - The server uses `healthResponseSchema` in `/healthz`.
  - The frontend uses it in `src/axon.Frontend/src/api/health.ts`, where `fetchHealth()` parses the response. The page doesn't render the result.
  - Shared tests run in the server unit suite.

### Node version, tests and CI

- **A-3 Playwright `webServer`:**
  - CI: `npm run start -w src/axon` with `PORT=3100`. Local: `npm run build && npm run start -w src/axon`.
  - Waits on `http://127.0.0.1:3100/healthz`, with `reuseExistingServer: !process.env.CI` and a 120 s timeout.
  - `baseURL` is `http://127.0.0.1:3100`; only the `chromium` project runs.
- **A-7 Node version:** Node 20; `.nvmrc` set to `20`; `engines.node >=20`.
- **A-8 Smoke test files:**

  | Suite | Files |
  | --- | --- |
  | `unit` | `src/axon/src/http/health.test.ts` (may be split) |
  | `integration` | `src/axon/test/app.spec.ts`, `src/axon/test/repo/ci-workflow.spec.ts` |
  | `frontend` | `src/axon.Frontend/src/App.test.tsx`, `src/api/health.test.ts`, `vite.config.test.ts` |
  | `e2e` | `src/axon.E2ETests/smoke.spec.ts` |

- **A-10 Suite files for agents:** each `.github/scripts/test/suites/*.json` gets a `"bin"` path to the hoisted runner in the root `node_modules`. `e2e.json` gets `"playwrightProject": "chromium"`.
- **A-11 How tests run:**
  - **CI** never uses `test.mjs`. It runs these root scripts:

    | Root script | Runs |
    | --- | --- |
    | `test:unit` | `vitest run --project unit` in `src/axon` |
    | `test:integration` | `vitest run --project integration` in `src/axon` |
    | `test:frontend` | `vitest run` in `src/axon.Frontend` |
    | `test:e2e` | `playwright test --project chromium` |
    | `test:dev-smoke` | `node --test scripts/dev-smoke.test.mjs` |

  - Each Vitest project's include patterns must match the suite JSON globs.
  - `passWithNoTests` stays off.
  - **Agents** use `test.mjs <suite> --scope created|related`.
- **A-12 CI security:** pinned actions, `contents: read`, a concurrency group with cancel-in-progress.
- **A-14 Dev smoke:** `scripts/dev-smoke.test.mjs` uses `node:test` and the built-in `fetch`, with no new dependencies.
  1. Starts `npm run dev` detached with `PORT=3000`.
  2. Polls `127.0.0.1:5173/healthz` every 500 ms for up to 60 s, and fails at once if the child exits.
  3. Runs the three proxy checks.
  4. Sends `SIGTERM` to the process group, then `SIGKILL` after 10 s.
  5. Skips on Windows with a stated reason.
- **A-18 CI workflow spec:** lives in the integration suite. A pure `checkWorkflow(doc): string[]` runs on the real `ci.yml` (expects no violations) and on 7 mutated copies (expects violations). Steps are matched by their exact `run` value.

### Accessibility and scope

- **A-15 App name:** "Axon".
- **A-16 Accessibility:** the axe scan is Required.
- **A-17 Branch protection:** making the CI check required on `main` is out of scope; the repo owner sets it.

### Implementation findings

- npm workspaces install binaries in the root `node_modules`, so the suite JSONs need `bin` paths (A-10).
- `unit` and `integration` both target `src/axon`; two Vitest projects keep them apart.
- npm package names must be lowercase (A-5).

### Follow-ups (out of scope)

- Cache headers for static files.
- Graceful `SIGTERM` handling (with the story that sends `game:ended`).
- A Dockerfile.
- Branch protection.

## Implementation Notes

### Backend (if applicable)

- Root `package.json` with npm workspaces and scripts `dev`, `build`, `lint`, `typecheck`.
- `src/axon`: Express app factory (`http/`), `server.ts` composition root, `helmet`, `GET /healthz`, static serving of the built frontend with SPA fallback, Socket.IO attached (no events yet).
- `src/axon.Shared`: package skeleton exporting at least one Zod schema/type used by server and client.
- Unit test (`src/axon/src/**/*.test.ts`) and integration test (`src/axon/test/**/*.spec.ts`, supertest) smoke tests.

### Frontend (if applicable)

- `src/axon.Frontend`: Vite + React 19 + TypeScript strict, Tailwind, React Router with a home route showing the app name, Zustand installed, shadcn/ui set up.
- Vite dev proxy for `/api` and `/socket.io`.
- Vitest + Testing Library smoke test.
- `src/axon.E2ETests`: Playwright config with `webServer`, one smoke spec loading `/`.

## Test Strategy

- Unit tests: app factory / healthz handler; shared schema smoke.
- Integration tests: `GET /healthz` returns 200; responses carry helmet headers incl. CSP; `/` serves the SPA.
- E2E tests: open `/` and see the app name.

## Requirements (from phase 1)

Approved by `@requirements-review` on attempt 3 (5/5). Each AC is marked **[Must]** or **[Should]**.

### Refined acceptance criteria

#### AC-1: Install and build [Must]

- **Happy path:** A developer on a fresh clone with Node 20 runs `npm ci` and then `npm run build` at the root, and both exit 0.
  - Build order: `src/axon.Shared/dist` → `src/axon/dist` → `src/axon.Frontend/dist`.
  - The E2E workspace has no build step; `typecheck` covers it.
- **Clean tree:** After the build, `git status --porcelain` is empty. `.gitignore` covers `dist/`, `coverage/`, `test-results/`, `playwright-report/` and `.github/memorybank/test-runs/`.
- **Negative:** A type error in any built workspace makes `npm run build` exit non-zero.

#### AC-2: Health endpoint [Must]

- **Happy path:** An HTTP client sends `GET /healthz`:
  - status `200`
  - `Content-Type` starts with `application/json`
  - `Cache-Control: no-store`
  - body exactly `{"status":"ok"}`, valid against `healthResponseSchema`
- **No extra information:** no version, uptime, host or environment in the body.
- **HEAD:** `HEAD /healthz` returns `200` with an empty body.
- **Negative:** `POST /healthz` returns `404` with `{"code":"NOT_FOUND","message":"Not found"}`, never `200` or the SPA.

#### AC-3: App shell [Must]

- **Happy path:** With the built frontend served, a player's browser opening `/` gets:
  - `200` `text/html` (the `index.html`)
  - `<html lang="en">` and `<title>Axon</title>`
  - exactly one `<h1>`, reading "Axon"
  - no game controls
- **Deep link:** `GET /g/abc123` returns `index.html`, and the client shows "Page not found".
- **Negative:** Without a static folder, the server still starts:
  - `/healthz` returns `200`
  - `/` returns `404` JSON, never a `500` or a stack trace

#### AC-4: Routing outside the SPA

The SPA fallback answers only `GET`/`HEAD`. It skips `/api`, `/socket.io` and paths with a file extension.

| # | Request | Response | Priority |
| --- | --- | --- | --- |
| a | Unknown `/api/*`, any method | `404` JSON `{"code":"NOT_FOUND","message":"Not found"}` | Must |
| b | `GET /socket.io/?EIO=4&transport=polling` | `200`, not HTML | Must |
| c | `GET /assets/missing.js` | `404` JSON | Should |
| d | `POST /` | `404` JSON | Should |
| e | Unhandled error | `500` `{"code":"INTERNAL","message":"Internal server error"}`, no stack, path or internal ID | Must |

#### AC-5: Security headers on every Express response [Must]

- **Required headers:**
  - CSP exactly as in A-2
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: no-referrer`
  - `X-Frame-Options: DENY`
  - `Strict-Transport-Security` with `max-age=`
  - `Cross-Origin-Opener-Policy: same-origin`
  - `Cross-Origin-Resource-Policy: same-origin`
- **Response classes tested (9):**

  | Class | Request |
  | --- | --- |
  | 200 JSON | `GET /healthz` |
  | 200 HEAD | `HEAD /healthz` |
  | 200 HTML | `GET /` |
  | 200 HTML (SPA fallback) | `GET /g/abc123` |
  | 200 static file | `GET /assets/app.js` |
  | 404 API | `GET /api/does-not-exist` |
  | 404 missing file | `GET /assets/missing.js` |
  | 404 wrong method | `POST /` |
  | 500 | `/__test/throw` |

- **Exclusion:** `/socket.io/` requests are handled by Socket.IO's engine before Express, so helmet doesn't cover them.
- **Browser:** loading `/` in Chromium records no `securitypolicyviolation` event and no console error.
- **Negative:**
  - No `X-Powered-By` header.
  - The error handler keeps helmet's headers.
  - No `'unsafe-eval'` or non-`'self'` origins; `data:` only in `img-src`/`font-src`.

#### AC-6: Socket.IO attached, no application events [Must]

- A `socket.io-client` connecting to `/` gets `connect`.
- `io.of('/').listenerCount('connection')` and `io.listenerCount('connection')` are both `0`.
- **Negative:** namespace `/nope` raises `connect_error` "Invalid namespace".

#### AC-7: Development mode [Must]

- **Happy path:** `npm run dev` at the root uses `concurrently --kill-others-on-fail` to start:
  - the server with `tsx watch` on `PORT` (default 3000)
  - Vite on `127.0.0.1:5173` with `strictPort`
- **Through port 5173:**
  - `/healthz` returns `{"status":"ok"}`
  - `/api/does-not-exist` returns the server's 404 JSON
  - `/socket.io` polling returns `200`, not HTML
- **Vite config:** exports a plain object with proxy entries `/api`, `/healthz` and `/socket.io` → `http://127.0.0.1:3000`; `/socket.io` has `ws: true`.
- **`resolvePort(env)`:** `3000` by default, `4000` when `PORT=4000`.
- **Negative:**
  - `resolvePort` throws on `abc`, `0` or `70000`, and the server exits non-zero.
  - Vite exits when port 5173 is taken.
  - If one process crashes, `npm run dev` exits non-zero.
- **How it's checked:** `npm run test:dev-smoke`, a Vite config unit test, and a `resolvePort` unit test.

#### AC-8: A smoke test in each suite [Must]

- **CI:** runs `npm run test:unit`, `test:integration`, `test:frontend` and `test:e2e`. Each exits 0 with at least 1 passing test, running exactly the files its `suites/<suite>.json` matches.
- **Agents:** `test.mjs <suite> --scope created` exits 0 for each suite.
- **Negative:** a suite with no tests fails (`passWithNoTests` stays off; Playwright fails on "No tests found"), and a failing test fails its CI step.

#### AC-9: Lint and type check [Must]

- On a fresh clone after `npm ci` with nothing built, `npm run lint` and `npm run typecheck` exit 0.
- They cover all 4 workspaces; lint also covers root `scripts/`.
- Every `tsconfig` extends `tsconfig.base.json` with `strict: true` and none overrides it.
- **Negative:** an ESLint error or a type error makes the matching command exit non-zero.

#### AC-10: CI workflow [Must]

- **Trigger:** `.github/workflows/ci.yml` runs on `pull_request` to `main` and `push` to `main`. This PR must be green.
- **Job `build-test`** on `ubuntu-latest`, steps in order:
  1. checkout@v4
  2. setup-node@v4 with Node 20 and the npm cache
  3. `npm ci`
  4. `npm run lint`
  5. `npm run typecheck`
  6. `npm run build`
  7. `npm run test:unit`
  8. `npm run test:integration`
  9. `npm run test:frontend`
  10. `npm run test:dev-smoke`
  11. `npx playwright install --with-deps chromium` (`working-directory: src/axon.E2ETests`)
  12. `npm run test:e2e`
  13. `actions/upload-artifact@v4` with `if: failure()`, uploading `playwright-report/` and `test-results/`
- **Settings:**
  - `permissions: contents: read`, and no job widens it
  - concurrency on `github.workflow` + `github.ref` with `cancel-in-progress: true`
  - every `uses:` pinned to `@vN` or a SHA
- **Negative:** a failing step fails the job and skips the rest except step 13. There is no `continue-on-error`, and no `if:` except on step 13.
- **How it's checked:** an integration spec, `src/axon/test/repo/ci-workflow.spec.ts`, runs `checkWorkflow(doc): string[]` against the real `ci.yml` and against mutated copies. `actionlint` is an optional extra job.

### BDD scenarios

| Group | Scenarios |
| --- | --- |
| AC-1 | Fresh clone install and build; Build fails on a type error |
| AC-2 | Health check; HEAD on health; Wrong method on health |
| AC-3 | App shell; Deep link falls back to the SPA; Client not-found; Server starts without a built frontend |
| AC-4 | Requests that must not get the SPA (outline); Socket.IO polling isn't the SPA; Unhandled error doesn't leak internals |
| AC-5 | Headers on every response class (9-row outline); No CSP or axe violations in the browser |
| AC-6 | Socket.IO client connects; No application events registered; Unknown namespace rejected |
| AC-7 | Dev script starts both servers and the proxy works; Dev smoke fails when dev mode doesn't come up; Vite config proxies to the server; `resolvePort` outline |
| Shared contract | `fetchHealth` validates with the shared schema; `fetchHealth` rejects an invalid response |
| AC-8 | Each suite passes (outline); Agent runs created tests; Empty suite fails |
| AC-9 | Lint and type check pass on a fresh clone; Lint error fails; Type error fails |
| AC-10 | CI green on the PR; Workflow structure meets the contract; Workflow rules detect breakage (7 mutations) |

### Test Awareness Matrix

| Category | Need | What to test |
| --- | --- | --- |
| Unit, backend (`npm run test:unit`, Vitest project `unit`) | Required | `healthResponseSchema` accepts `ok` and rejects `down`, `{}` and extra keys; the handler body; `resolvePort`; `errorHandler` returns the 500 JSON without a stack and keeps headers |
| Integration (`npm run test:integration`, Vitest project `integration`) | Required | AC-2 to AC-6 using `createApp({ staticDir, extendRoutes })` with fixtures, port 0, cleanup in `afterAll`; AC-10 workflow spec (`yaml` devDependency) |
| Unit, frontend (`npm run test:frontend`) | Required | App heading at `/`; not-found view; `fetchHealth` ok and invalid; Vite config test. The loading, error, null and empty UI states are N/A |
| Dev smoke (`npm run test:dev-smoke`, `node:test`) | Required | Starts root `npm run dev` and checks the 3 proxy paths through 5173, then stops the whole process group |
| E2E (`npm run test:e2e`, Chromium) | Required | Heading, title and `lang`; no console errors or CSP violations; axe scan with zero violations |
| Accessibility | Required | axe scan in the E2E smoke test |
| Security | Required | Exact CSP and headers on every Express response class including 500; no `X-Powered-By`; no internals in errors; unknown namespace rejected; CI `contents: read` and pinned actions |
| CI | Required | Structural spec plus this PR's green run |
| Build and tooling | Required | Fresh-clone `npm ci`, `build`, `lint` and `typecheck`; clean tree after the build |
| Performance, i18n, authorization | N/A | — |

### Tracker update

Needed — Applied (issue #1 updated with the refined AC after approval; `context.md` re-fetched).

## Agent Sequence

1. `@requirements` → refine AC, BDD, Test Awareness Matrix; gate `@requirements-review`
2. `@code-backend` → workspaces root, server, shared, unit tests; then `@code-frontend` → React app, Playwright skeleton, CI; gate `@code-review` + `@test-review` (unit)
3. `@test-api` + `@test-e2e` in parallel → integration and E2E smoke tests; gate `@test-review` (int/E2E)
4. `@code-review` → test code; then `@pr-create`

## Status

[x] Branch created
[x] Requirements clear
[x] Tracker story updated (or confirmed not needed)
[x] Implementation complete (app code + unit tests)
[x] Code reviewed (app code)
[ ] Draft PR created
[x] Integration tests written
[x] E2E tests written
[x] Code reviewed (test code)
[ ] PR ready

## Review Gate Status

| Phase | Attempt | Rating | Verdict | Reviewer | Notes |
| --- | --- | --- | --- | --- | --- |
| requirements | 1 | 3 | REFINE | @requirements-review | Must Fix: negative cases per AC, repeatable AC-7 dev-proxy check, CI happy path, missing BDD clauses, canonical CI test command, shared Zod contract used by server and client, deterministic CI validation |
| requirements | 2 | 3 | REFINE | @requirements-review | Must Fix: automated check for root `npm run dev`, structural CI workflow test, canonical whole-suite CI command vs test-runner skill, helmet headers on 500 |
| requirements | 3 | 5 | APPROVE | @requirements-review | All Must Fix resolved; no Should Fix |
| implementation | 1 | 2 | REFINE | @code-review | Must Fix: `@axe-core/playwright` 4.14.0 needs Node ≥22.12; integration suite runs unit tests (no Vitest project isolation); 4 audit vulnerabilities (2 critical) unclassified. Should Fix: deprecated `baseUrl` in frontend tsconfig |
| implementation | 1 | 5 | APPROVE | @test-review (unit) | All unit behaviors covered |
| implementation | 2 | 5 | APPROVE | @code-review | All findings resolved: axe 4.13.0, Vitest project wrappers (`src/axon/scripts/vitest-{unit,integration}.mjs`), vitest 4.1.12, 0 audit findings, `baseUrl` removed |
| tests | 1 | 2 | REFINE | @test-review (int/E2E) | Must Fix: HEAD boundaries (AC-4); dev crash propagation (AC-7); tooling structural checks (AC-1/8/9); `checkWorkflow` missing setup-node, `@v4`, working-directory, `test-results/` (AC-10). Green CI run is verified after the PR is opened |
| tests | 2 | 2 | REFINE | @test-review (int/E2E) | Prior gaps mostly fixed (integration 103/103, E2E 4/4). Must Fix: clean tree not checked after a real build; Playwright `--pass-with-no-tests` not detected; artifact paths matched by substring. Escalated: rating 2 after a retry. The human approved one more refinement (attempt 3) |
| tests | 3 | 5 | APPROVE | @test-review (int/E2E) | All findings resolved. Integration 121/121, E2E 4/4. CI gained a clean-tree step (`test -z "$(git status --porcelain)"`) after build, so AC-10 now has 14 steps |
| test code | 1 | 3 | REFINE | @code-review | Regressions all pass (unit 39, integration 121, frontend 14, E2E 4). Must Fix: dev-smoke readiness can pass against an already-running instance on 5173; probes have no timeout; child process not checked to be alive. Should Fix: drop `networkidle` in the E2E smoke test. Escalated: counts as a phase 4 refinement, and phase 4 retries are used up |
| test code | 2 | 4 | APPROVE | @code-review | Human approved an extra refinement. Dev-smoke hardened (port pre-check, 2 s probe timeout, child-alive check), `networkidle` removed. Regressions: unit 39, integration 121, frontend 14, E2E 4. Should Fix (logged, not done): clear the 10 s SIGKILL timer in dev-smoke teardown once the child exits |
