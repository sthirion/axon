# Planning Poker

## What Planning Poker Is

Planning Poker is a consensus-based estimation technique used by agile teams to size work
items (user stories, issues) during sprint planning or backlog refinement. Each team member
privately picks a card with an estimate, all cards are revealed at the same time, and the
team discusses differences until it agrees on a value. Revealing at the same time stops
people from anchoring on the first or most senior voice.

A Planning Poker app moves this ritual online so that remote and hybrid teams can estimate
together from any browser. Reference product:
[Planning Poker Online](<https://planningpokeronline.com/>).

## How It Works

1. **Start a game.** A facilitator creates a game, picks a card deck (for example
   Fibonacci or T-shirt sizes), and optionally adds the issues to estimate.
1. **Invite the team.** The facilitator shares the game URL. Players join from any device
   and enter a display name.
1. **Vote.** For the current issue, every player picks a card in secret. The table shows
   who has voted, but not what they voted.
1. **Reveal.** The facilitator reveals the cards. The app shows every vote, the
   distribution, and the average, and highlights agreement or outliers.
1. **Agree and move on.** The team discusses, re-votes if needed, and the facilitator
   records the final estimate before moving to the next issue.

## Key Features of the Reference Product

- **Live voting:** the facilitator runs a real-time session while the team votes.
- **Async voting:** players vote at their own pace; the facilitator reveals later.
- **Voting overview and results:** all votes, result bars, and a reaction from a mascot.
- **Issue management:** add issues manually, paste them, or import from CSV.
- **Integrations:** native Linear integration and a Jira plugin.
- **Card decks:** Fibonacci, modified Fibonacci, T-shirt sizes, powers of 2, custom decks.
- **Spectator mode:** join without voting.
- **Any device:** responsive web app, no install.
- **Accounts and history (paid):** saved games, history, resumable games, facilitator
  licences.
- **Free tier limits:** 9 votings and 5 issues per game, games kept for 6 weeks.

## Common Uses

- Sprint planning and backlog refinement for Scrum and Kanban teams.
- Relative sizing of epics during roadmap planning.
- Quick team polls where hidden votes help avoid groupthink.

## Scope Decisions

| Topic | Decision |
| --- | --- |
| Accounts | No accounts. The facilitator creates a session and shares a unique link. Everyone who joins enters a name. |
| Voting mode | Live voting only. No async voting. |
| Card deck | Fibonacci only: 0, 1, 2, 3, 5, 8, 13, 21, ?, coffee. |
| Issues | MVP: the facilitator enters one story per round (title and optional work-item link). Later: Azure DevOps integration. |
| Facilitator | Sets the story, reveals, resets for a re-vote, records the final estimate, moves to the next story, and can remove players. Does not vote. |
| Facilitator disconnect | The game waits. The facilitator can rejoin from the same browser with the same link. |
| Voters | Can vote and change their vote until the reveal. |
| Reveal shows | All individual votes, distribution bars, average, consensus or outlier highlight. |
| `?` and coffee | Shown as votes but left out of the average and the consensus check. |
| Consensus | All numeric votes are equal. When they differ, the lowest and highest votes are highlighted as outliers. |
| Session summary | Lists every story in the session with its final estimate. |
| Theme | Light/dark toggle per user. Follows the OS setting by default. |
| Scale | Up to about 20 players per game. |
| Retention | In memory only. The game is gone when everyone leaves. |
| Out of scope | Throwing emojis, async voting, spectator mode, other decks, CSV import, timer, export, history, pricing tiers. |

## Open Questions

None. Ready for [requirements.md](requirements.md).
