# Story Plan: 2 — Create a game and join it with a link and a name

## Branch

`feature/2-create-and-join-game`

## Context

`.github/memorybank/stories/2/context.md` — story text, comments, and related work items (snapshot; do not edit). Refined AC live below, not there.

**Specs:**

- `.github/memorybank/features/planning-poker/requirements.md`: Req 1, Req 2, Req 9.1.
- `.github/memorybank/features/planning-poker/design.md`: Data Model, Realtime Events, `PublicGameState`, Join and Reconnect, REST API, Security, Error Handling.
- `.github/project-config.md`: structure, Authorization Model.

**Builds on story #1 (merged):**

- `createApp({ staticDir, extendRoutes })` and `attachSocketIo` in `src/axon`.
- `healthResponseSchema` in `@axon/shared`.
- The React shell, whose catch-all "Page not found" route currently also matches `/g/:id`.
- E2E smoke spec, integration specs, CI.

## Scope

Full-stack. The story covers:

- **Server:** `GameStore`, REST endpoints, Socket.IO handlers.
- **Shared:** Zod schemas and event types.
- **React:** create page, join prompt, poker table and Socket.IO client.

## Summary

A facilitator creates an in-memory game and shares its unguessable link. Voters join with only a name, using a per-game player token kept in `localStorage` so a reload restores their seat. Every player sees the live list of participants with their online/offline status.

## Acceptance Criteria

1. Given the home page, when I enter a name (1-30 characters after trimming) and create a game, then I land on `/g/{gameId}` as facilitator and see the join link with a copy button.
2. The `gameId` is generated with at least 128 bits of randomness; no account, email or password is asked for.
3. Given a valid game link, when a visitor opens it, then they are asked for a name before joining.
4. Given a name that is empty, longer than 30 characters, or already used in the game (case-insensitive), when the visitor submits it, then it is rejected with a clear message (`INVALID_NAME` / `NAME_TAKEN`) and they can try again.
5. Given a voter joins, then every connected player sees the new voter within 1 second.
6. Given a player reloads the page or reconnects, when their browser still has the player token for that game, then they rejoin with the same name and role without being asked for a name.
7. Given a link to a game that does not exist, when it is opened, then a "game not found" page is shown with a link to create a new game.
8. Every player sees each player's online or offline status, and the facilitator is shown separately from voters.
9. Player tokens are generated on the server, stored only as hashes, kept in the browser's `localStorage` (one per game), and never appear in URLs or logs.
10. Games, names and tokens are kept in memory only; nothing is written to disk or a database.
11. Every socket payload and request body is validated with a Zod schema from `src/axon.Shared`; invalid payloads get an error ack and do not change state.

## Assumptions

- **Clarity Gate passed.** The AC are testable, the scope is full-stack, and authorization is token-based per game. The contracts are outlined in `design.md`.
- **Out of scope for this story:**
  - Voting, story, reveal and facilitator actions (stories #3–#6).
  - Game deletion and the cleanup sweeper (story #7).
  - Theme (story #8).
  - Socket rate limiting and CORS hardening (story #9).
- **Existing behaviour that changes:** the story 1 E2E smoke test expects "Page not found" at `/g/abc123`. That path now becomes the game route, which shows "game not found" for unknown IDs, so that E2E expectation must be updated.
- **From `@requirements` (attempt 2):** assumptions A-1 to A-17 in `requirements.md` are binding. Key points:
  - `PublicGameState` has players only.
  - `gameId` is 22 base64url characters; the token is 43 characters, stored as SHA-256 with a constant-time compare, in `localStorage["axon.playerToken.<gameId>"]`.
  - Names: trim, NFC, 1–30 code points, no control characters, unique case-insensitively.
  - New error codes: `INVALID_TOKEN`, `INVALID_PAYLOAD`, `ALREADY_JOINED`, `INVALID_REQUEST`, `PAYLOAD_TOO_LARGE`.
  - Logs contain `{event, gameId}` only.
  - Socket.IO runs with `cookie: false`.
  - `GameStore` is injected into `createApp` and `attachSocketIo`.
- **Accepted limitation (@story decision):** without working `localStorage`, a facilitator who reloads loses the seat. There are no accounts and nothing is persisted.

## Implementation Notes

### Backend (if applicable)

- **Shared (`@axon/shared`):**
  - Zod schemas for the player name, `createGame` body, `game:join` payload, `game:joined`, `PublicGameState` (players only for now) and the ack/error codes.
- **Server, store and HTTP:**
  - `store/gameStore.ts`: in-memory `Map`; `gameId` from `crypto.randomBytes(16)` as base64url; player token from 32 random bytes; SHA-256 hash; constant-time compare.
  - `http/` routes: `POST /api/games { name }` → `201 { gameId, token }`; `GET /api/games/:id/exists` → `{ exists }`.
- **Server, realtime:**
  - `realtime/gateway.ts` handles `game:join` with a token (reconnect) or a name (new voter).
  - It manages rooms, tracks connected/offline via a `socketIds` set, and broadcasts `game:state`.
  - Ack errors: `GAME_NOT_FOUND`, `INVALID_NAME`, `NAME_TAKEN`.
- **Authorization:** the role comes from the token; facilitator vs voter is resolved on the server.
- **Security:**
  - Tokens are never logged or put in URLs.
  - Every payload is validated with Zod.
  - Story 1's `helmet` and CSP stay in place.

### Frontend (if applicable)

- **Pages:** create page (`/`), game page (`/g/:gameId`) with a join prompt, the poker table and a game-not-found view.
- **Client state:** Socket.IO client service, a Zustand store fed by `game:state`, and the token per game in `localStorage`.
- **UX states:** connecting/loading, name validation errors, game not found, connected table with online/offline badges, copy-link feedback.

## Test Strategy

- **Unit tests:** `GameStore` (ID/token generation, hashing, name rules), Zod schemas, gateway join logic, client store and the components.
- **Integration tests:**
  - REST: `POST /api/games`, `exists`.
  - Socket.IO: join with a name, join with a token, the error codes, a broadcast to the other players within 1 s, online/offline status, invalid payloads leaving state unchanged.
  - Tokens never appear in URLs or responses (except to their owner).
- **E2E tests:**
  - A facilitator creates a game, two voters join in separate contexts, and everyone sees them.
  - A reload restores the seat.
  - An unknown game shows "game not found".
  - Update the story 1 smoke deep-link expectation.

## Requirements (from phase 1)

Approved by `@requirements-review` on attempt 2 (5/5). The full text is in `.github/memorybank/stories/2/requirements.md`: AC-1 to AC-12 with actors and negative paths, two Gherkin features, the Test Awareness Matrix with What/Why/Watch out for, and assumptions A-1 to A-17. That file is gitignored and kept locally for the whole story. Every subagent must read it.

- **Refined acceptance criteria:** AC-1 to AC-11 are [Must]. AC-11's `design.md` documentation item and AC-12 are [Should].

  | AC | Topic |
  | --- | --- |
  | AC-1 | Create a game: REST 201/400/413, copy link, client validation |
  | AC-2 | 128-bit base64url `gameId`; no accounts or cookies, Socket.IO handshake included |
  | AC-3 | Exists check; join prompt; `{exists:false}` for unknown or malformed IDs |
  | AC-4 | Name rules; `INVALID_NAME`, `NAME_TAKEN` |
  | AC-5 | Broadcast to everyone within 1 s; failed joins send nothing; rooms isolated |
  | AC-6 | Token rejoin: name comes from `game:state`; `INVALID_TOKEN`; role from token only; no reload recovery without `localStorage` |
  | AC-7 | "Game not found" vs "Page not found"; story #1 smoke test update |
  | AC-8 | Facilitator and voters with online/offline text; multi-tab |
  | AC-9 | Token secrecy |
  | AC-10 | Memory only |
  | AC-11 | Zod everywhere; error codes; `ALREADY_JOINED`; update `design.md` error codes |
  | AC-12 | Loading and reconnecting states |

- **BDD scenarios:** 46 scenarios in the features "Create a game" and "Join a game", including a responsive outline at 1280×800 and 390×844.
- **Test Awareness Matrix:**
  - Required: unit (backend), REST and Socket.IO integration, unit (frontend), E2E, responsive, accessibility, security, performance, authorization.
  - N/A: i18n, rate limiting/CORS.
- **Tracker update:** Needed — Applied (issue #2 updated after approval; `context.md` re-fetched).

## Agent Sequence

1. `@requirements` refines the AC, BDD and Test Awareness Matrix; gate: `@requirements-review`.
2. Implementation, then gate: `@code-review` + `@test-review` (unit).
   1. `@code-backend`: shared schemas, `GameStore`, REST, gateway and unit tests.
   2. `@code-frontend`: pages, socket client, store and unit tests.
3. `@test-api` + `@test-e2e` in parallel; gate: `@test-review` (int/E2E).
4. `@code-review` of the test code, then `@pr-create`.

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
| requirements | 1 | 3 | REFINE | @requirements-review | Must Fix: two `Feature:` blocks in one Gherkin document; AC-6 name vs `game:joined` contract unclear; no responsive/mobile coverage; matrix rows missing why or watch-outs. Should Fix: Socket.IO cookie assertion, `localStorage` failure coverage, record new error codes in `design.md` |
| requirements | 2 | 5 | APPROVE | @requirements-review | All findings resolved |
| implementation | 1 | 3 | REFINE | @code-review | Regressions pass (unit 222, integration 27, frontend 110). Must Fix: when the `localStorage` write fails on create, the facilitator token is lost on navigation, so the same tab gets the voter prompt |
| implementation | 1 | 3 | REFINE | @test-review (unit) | Must Fix: no tests for ignoring late exists/join results after unmount, retry or route change in `useGameSession` |
| implementation | 2 | 5 | APPROVE | @code-review | Fixed with an in-memory per-tab token fallback in `playerTokenStorage`. Regressions: frontend 129, unit 222, integration 27 |
| implementation | 2 | 5 | APPROVE | @test-review (unit) | Tests for stale exists/join results added; removing either guard makes them fail |
| tests | 1 | 3 | REFINE | @test-review (int/E2E) | Integration 228/228, E2E 29/29 (after the app fix `z.config({ jitless: true })` for a Zod CSP eval violation). Must Fix: keyboard-only E2E flow. Should Fix: use the Join and Copy controls at mobile width |
| tests | 2 | 5 | APPROVE | @test-review (int/E2E) | Keyboard-only and mobile-operation tests added. E2E 33/33, integration 228/228 |
| test code | 1 | 5 | APPROVE | @code-review | Regressions: integration 134, E2E 33, unit 222, frontend 130. Zod jitless CSP fix approved |
