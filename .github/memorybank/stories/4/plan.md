# Story Plan: 4 — Reveal votes with distribution, average, consensus and outliers

## Branch

`feature/4-reveal-votes-and-results`

## Context

`.github/memorybank/stories/4/context.md` — story text snapshot (do not edit). Refined AC and contracts: `.github/memorybank/stories/4/requirements.md` (gitignored, local).

**Specs:** feature `requirements.md` Req 5, Req 4.6, Req 3.6; `design.md` Game State Machine, Realtime Events, `PublicGameState`/`RoundStats`, Vote and Reveal, Results Calculation; `.github/project-config.md` Authorization Model.

**Builds on #1, #2, #3, #12, #14 (merged):** shared schemas and `GAME_EVENTS`, pure `domain/game.ts`, `realtime/gateway.ts` (`decideCommand`), Zustand `gameStore`, `GameTable`, `StoryPanel`, `CardDeck`, `VoteBadge`, `useVoteAnnouncement`.

## Scope

Full-stack.

- **Shared:** `revealed` phase, `GAME_EVENTS.roundReveal`, `RoundStats` schema, `voters[].card?` and `results?` in the strict `PublicGameState` (only valid when `revealed`).
- **Server:** pure `domain/results.ts` (`calculateStats`), `revealRound` in the domain, `round:reveal` handler, `WRONG_PHASE` for `vote:cast` and `story:set` in `revealed`, `toPublicState` adds cards and results only when revealed.
- **React:** "Reveal votes" button, `ResultsPanel` (bars, average, consensus), cards and outlier markers and "No vote" in player rows, deck and story edit locked after reveal, aria-live announcements.

## Summary

The facilitator reveals the round once at least one vote exists. Everyone then sees every voter's card, a distribution, the average over numeric votes, consensus or outliers. Voting and story edits close. Re-vote and final estimate are #5.

## Implementation Notes

1. **Shared** (`src/axon.Shared`): extend `gamePhaseSchema`; add `roundStatsSchema`; update `publicGameStateSchema` (strict, with a refine: `card`/`results` only when `revealed`); export the new names; add `roundReveal` event.
2. **Domain:** `results.ts` with `calculateStats` (integer rounding formula, tie → higher). `revealRound(game, playerId)`: role → `FORBIDDEN`, phase/≥1 vote → `WRONG_PHASE`. `setStory` gets a phase check (`revealed` → `WRONG_PHASE`) after the role check. `castVote` already rejects non-`voting`. `toPublicState` adds `card` and `results`.
3. **Gateway:** `round:reveal` via `decideCommand` with a permissive envelope; ack, then `game:state` only. Log via `logEvent('round.rejected', ...)`.
4. **Frontend:** types and store accept the new state; `ResultsPanel` organism; `PlayerRow`/`VoteBadge` show the card, outlier marker and "No vote"; reveal action in `useGameSession`/`gameSocketService` with the 5 s ack timeout and `actionErrors`; `StoryPanel` hides Edit in `revealed`; `CardDeck` disabled in `revealed`; extend `useVoteAnnouncement` for the reveal (skip the first state).
5. **Specs:** update `design.md` and the `project-config.md` Authorization Model as listed in A-5.

## Test Strategy

- **Unit:** `calculateStats` (every table row + rounding/tie/empty), domain `revealRound`/guards/`toPublicState`, schemas (strict refine), gateway handler, components, store, announcements.
- **Integration (Socket.IO):** reveal contract and check order, `WRONG_PHASE` cases (no votes, waiting, twice, vote/story after reveal), `FORBIDDEN`, no `card`/`results` in any pre-reveal `game:state`, rejoin/late join in `revealed`, timing under 1 s. Wait for events, not acks, before asserting (lesson from #14).
- **E2E:** facilitator reveals with mixed votes; consensus case; outliers; `?`/coffee only; no-vote row; disabled reveal; voter has no button; deck locked; responsive (1280×800, 390×844); axe in `revealed`; live region text.

## Agent Sequence (manual; the `.github` agents are not loaded in Claude Code)

1. Requirements — drafted (`requirements.md`); **review gate: user**.
2. Backend (shared, domain, gateway) with unit tests, then frontend with unit tests.
3. Integration tests, then E2E.
4. Lint, typecheck, all suites, then PR.

## Status

[x] Branch created
[x] Requirements drafted
[x] Requirements approved by user
[ ] Tracker story updated (not needed unless AC change)
[x] Implementation complete (app code + unit tests)
[x] Integration tests written
[x] E2E tests written
[ ] PR created
