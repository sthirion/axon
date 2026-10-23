# Story Plan: 3 — Set the story and vote with hidden cards

## Branch

`feature/3-set-story-and-vote`

## Context

`.github/memorybank/stories/3/context.md` — story text, comments, and related work items (snapshot; do not edit). Refined AC live below, not there.

**Specs:**

- `.github/memorybank/features/planning-poker/requirements.md`: Req 3 and Req 4.
- `.github/memorybank/features/planning-poker/design.md`: Game State Machine, Realtime Events, `PublicGameState`, Security, Error Handling.
- `.github/project-config.md`: structure, Authorization Model.

**Builds on stories #1, #2 and #12 (all merged):**

- `@axon/shared`: schemas, `GAME_EVENTS`, error codes.
- Server: pure `domain/game.ts`, `store/gameStore.ts`, `realtime/gateway.ts` (`game:join`, rooms `game:<gameId>`, `game:state` broadcast), `http/games.ts`.
- Frontend: `GamePage`, `useGameSession`, the Zustand `gameStore` fed only by `game:state`, `GameTable`, the per-tab token fallback, Zod jitless mode.
- Tests: unit, integration (`gameJoin.spec.ts`, `games.spec.ts`), E2E (`game.spec.ts`, `smoke.spec.ts`).
- `npm run lint` now includes a Prettier check.

## Scope

Full-stack:

- **Shared:** the card deck, story and vote schemas, and new error codes.
- **Server:** game phases, the `story:set` and `vote:cast` handlers, and role checks.
- **React:** `StoryPanel`, `CardDeck` and voted badges.

## Summary

The facilitator sets the story for the round: a title plus an optional `http` or `https` link. That moves the game from `waiting` to `voting`. Voters can pick, change or withdraw a Fibonacci card in secret. Every player sees who has voted, but no vote value leaves the server before the reveal (the reveal is story #4).

## Acceptance Criteria

1. Given I am the facilitator and no story is set, when I enter a title (1-200 characters) and an optional link, then the story is shown to every player and voting opens.
2. Given a story link that is not an absolute `http` or `https` URL, when the facilitator submits it, then it is rejected with `INVALID_STORY`.
3. Story links open in a new tab with `rel="noopener noreferrer"`.
4. Given voting is open, when the facilitator edits the title or link, then every player sees the change.
5. Given no story is set, then voters cannot vote.
6. Given voting is open, then a voter can pick one of 0, 1, 2, 3, 5, 8, 13, 21, ?, coffee, change it, or withdraw it.
7. Given a voter has voted, then every player sees that this voter has voted, but not the value.
8. Before the reveal, no vote value is sent to any client (verified by an integration test that inspects every `game:state` payload).
9. Given the facilitator sends `vote:cast`, then it is rejected with `FORBIDDEN`.
10. Given a card value that is not in the deck, then it is rejected with `INVALID_CARD`.
11. Given a voter sends `story:set`, then it is rejected with `FORBIDDEN`.
12. The card deck is a keyboard-accessible radio group (arrow keys and Space).

## Assumptions

- **Clarity Gate passed.** The AC are testable, the scope is full-stack, and the authorization rules are explicit (facilitator vs voter). The contracts are outlined in `design.md`.
- **Out of scope for this story:**
  - Reveal and results (#4).
  - Re-vote, final estimate, skip and summary (#5).
  - Facilitator-offline rules and player removal (#6).
  - The game lifetime sweeper (#7).
  - Theme (#8).
  - Rate limiting (#9).
  - In this story `revealed` does not exist yet, so the `WRONG_PHASE` behaviour after a reveal belongs to #4.
- **Process note:** each `@requirements` result is saved to `.github/memorybank/stories/3/requirements.md` (gitignored) before the gate runs. Subagents read `context.md` and don't call the GitHub MCP tools, so no permission prompts appear.
- **From `@requirements` (binding, see A-1 to A-19):**
  - `DECK` is in `@axon/shared`.
  - Title: trimmed, NFC, 1–200 code points, no control characters.
  - Link: optional, at most 2048 characters, absolute `http`/`https` with a host.
  - Check order: not joined → `FORBIDDEN`, then `GAME_NOT_FOUND`, `INVALID_PAYLOAD`, role → `FORBIDDEN`, phase → `WRONG_PHASE`, value → `INVALID_STORY` / `INVALID_CARD`.
  - Editing the story keeps votes.
  - A private `vote:mine` event goes only to the vote owner's sockets (room `player:<id>`). `game:state` never carries a card value.
  - On rejoin, the voter's own selection is restored through `vote:mine`.
  - Client ack timeout is 5 s.
  - The client store keeps `role` and `playerId`.
  - Logs contain only the event name, `gameId` and code.
- **Spec updates, once approved:**
  - The implementer changes feature `requirements.md` Req 4.4, `design.md` (Security, Realtime Events with `vote:mine`, Error Handling) and the `.github/project-config.md` Authorization Model to "no client other than the voter who owns the vote".
  - The rule that `game:state` never contains vote values stays.

## Implementation Notes

### Backend (if applicable)

- **Shared:**
  - `Card` deck constant and schema.
  - Story schema: title 1–200 after trimming; optional link that must be an absolute `http`/`https` URL.
  - `story:set` and `vote:cast` (card or `null` to withdraw) payloads.
  - `PublicGameState` gains `phase`, `story` and `voters[].hasVoted`.
  - New error codes: `INVALID_STORY`, `INVALID_CARD`, `FORBIDDEN`, `WRONG_PHASE`. Add them to the `design.md` Error Handling section.
- **Domain:**
  - `phase` is `waiting` or `voting`. `setStory` (facilitator only) moves `waiting` to `voting` and edits the story while `voting`.
  - `castVote` (voter only, phase `voting`) sets, changes or clears a vote.
  - `toPublicState` exposes `hasVoted` only, never the card value.
- **Gateway:**
  - Handlers resolve the sender from the socket's joined player.
  - Role and phase checks happen in the domain.
  - Ack codes; broadcast `game:state` only on success.

### Frontend (if applicable)

- **`StoryPanel`:** a story form for the facilitator (title, link, inline validation); a read-only title and link for voters, with the link opening in a new tab using `rel="noopener noreferrer"`.
- **`CardDeck`:** a radio group with the 10 cards, supporting arrow keys and Space. A voter can pick, change or withdraw a card. It is disabled when no story is set, and the facilitator doesn't see it.
- **Voted badges:** shown in the voters list with text, not only colour.
- **Waiting state:** voters see "Waiting for the facilitator to set the story".

## Test Strategy

- **Unit:** schemas (title boundaries, link schemes, deck), domain transitions and guards, `toPublicState` hiding values, gateway handlers, the components and the store.
- **Integration:**
  - The `story:set` and `vote:cast` contracts, `FORBIDDEN`, `INVALID_*`, `WRONG_PHASE` before a story is set, and edits during voting.
  - No vote value in any `game:state` payload.
  - Broadcast timing.
- **E2E:** the facilitator sets a story, voters vote, change and withdraw, everyone sees the voted badges, the link opens in a new tab, and keyboard-only card selection works.

## Requirements (from phase 1)

Approved by `@requirements-review` on attempt 1 (4/5), followed by one should-fix pass that was not re-gated. The full text is in `.github/memorybank/stories/3/requirements.md`:

- §1 contracts: deck, story schema, events, error precedence, `PublicGameState`, domain.
- §2 AC-1 to AC-19.
- §3 BDD, one `Feature:` per block.
- The Test Awareness Matrix.
- Assumptions A-1 to A-19.

That file is gitignored and kept locally for the whole story. Every subagent must read it.

- **Refined acceptance criteria:** all [Must] except AC-16 [Should].

  | AC | Topic |
  | --- | --- |
  | AC-1 | Set the story; voting opens |
  | AC-2 | Title rules |
  | AC-3 | Link: absolute `http`/`https` only |
  | AC-4 | Link rendered safely |
  | AC-5 | Editing the story keeps votes |
  | AC-6 | Only the facilitator sets the story (`FORBIDDEN`) |
  | AC-7 | No voting while `waiting` (`WRONG_PHASE`) |
  | AC-8 | Pick, change or withdraw a card; `vote:mine` |
  | AC-9 | `INVALID_CARD` |
  | AC-10 | Facilitator can't vote |
  | AC-11 | "Voted" badges |
  | AC-12 | No vote value reaches any other client |
  | AC-13 | Own vote survives offline, rejoin and multiple tabs |
  | AC-14 | Unjoined sockets and malformed events |
  | AC-15 | Keyboard radio group |
  | AC-16 | Screen reader announcements |
  | AC-17 | Pending, error and disconnected states |
  | AC-18 | Responsive layout |
  | AC-19 | Story #2 regression |

- **BDD scenarios:** several features, one `Feature:` per block (see §3).
- **Test Awareness Matrix:**
  - Required: unit (backend and frontend), Socket.IO integration, E2E, responsive, accessibility including keyboard, security, performance, authorization.
  - N/A: i18n.
- **Tracker update:** Needed — Applied (issue #3 updated after approval, including the `vote:mine` refinement of AC-8; `context.md` re-fetched).

## Agent Sequence

1. `@requirements` refines the AC, BDD and Test Awareness Matrix; output saved to `requirements.md`; gate: `@requirements-review`.
2. Implementation, then gate: `@code-review` + `@test-review` (unit).
   1. `@code-backend`: shared, domain and gateway, with unit tests.
   2. `@code-frontend`: `StoryPanel`, `CardDeck`, store and unit tests.
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
| requirements | 1 | 4 | APPROVE | @requirements-review | Confidence MEDIUM. Should Fix applied in one extra pass (same-origin link fixture, AC-12 checks by field and owner) and spec updates noted. `vote:mine` judged an acceptable refinement of AC-8 |
| implementation | 1 | 5 | APPROVE | @code-review | Regressions: unit 455, integration 134, frontend 255. Spec docs updated (Req 4.4, `design.md`, `project-config.md`) |
| implementation | 1 | 5 | APPROVE | @test-review (unit) | All unit behaviours and the UI state table covered |
| tests | 1 | 3 | REFINE | @test-review (int/E2E) | Integration 344, E2E 52. Must Fix: spoofed `role`/`playerId` integration test; browser-level checks for 44×44 card size and a visible focus indicator |
| tests | 2 | 5 | APPROVE | @test-review (int/E2E) | Spoofing tests added. The 44×44 tests found a 36 px "Withdraw vote"; fixed with `min-h-11 min-w-11` in the shared `Button`. Integration 196 (created), E2E 56 (full), lint clean |
| test code | 1 | 4 | APPROVE | @code-review | Regressions: integration 260, E2E 23 (created), unit 455, frontend 260. Should Fix (logged, not done): `Button.test.tsx` checks class names; rely on the pixel-level Playwright checks or test override behaviour |
