# Requirements: Planning Poker

## Introduction

A web app for agile teams to estimate user stories together in real time. A facilitator
creates a game and shares a unique link. Voters join with only a name, pick a Fibonacci card
in secret, and see all votes at once when the facilitator reveals them. The facilitator
records the agreed estimate and moves on to the next story. Games live in memory only.

## Glossary

- **Facilitator**: the person who creates the game and runs it. Does not vote.
- **Voter**: a person who joins through the game link and votes.
- **Player**: the facilitator or a voter.
- **Game**: one estimation session with a unique link. Exists in memory only.
- **Round**: estimating one story, from setting the story to recording the final estimate.
- **Story**: the work item being estimated: a title and an optional link.
- **Deck**: the Fibonacci cards 0, 1, 2, 3, 5, 8, 13, 21, `?` and coffee.
- **Numeric vote**: a vote on a card from 0 to 21. `?` and coffee are non-numeric.
- **Player token**: a random secret stored in the browser that identifies a player within one
  game.

## Feature List

| # | Feature | Priority |
| --- | --- | --- |
| F1 | Create a game and get a shareable link | MVP |
| F2 | Join a game with the link and a name | MVP |
| F3 | Set the story for a round (title and optional link) | MVP |
| F4 | Vote with the Fibonacci deck; change the vote until reveal | MVP |
| F5 | Reveal: individual votes, distribution, average, consensus and outliers | MVP |
| F6 | Re-vote, record the final estimate, move to the next story | MVP |
| F7 | Session summary of estimated stories | MVP |
| F8 | Facilitator reconnect and removing players | MVP |
| F9 | Light/dark theme | MVP |
| F10 | Azure DevOps integration (pick stories, write back estimates) | Later |

## Requirement 1: Create a Game (F1)

**User story:** As a facilitator, I want to start a game in one step so that my team can
begin estimating right away.

1. WHEN a visitor enters a name and creates a game THE SYSTEM SHALL create a game with an
   unguessable ID (at least 128 bits of randomness) and make that visitor its facilitator.
1. WHEN a game is created THE SYSTEM SHALL show the join link and a button that copies it.
1. THE SYSTEM SHALL issue the facilitator a player token that marks them as facilitator for
   that game.
1. THE SYSTEM SHALL NOT require an account, email or password.

## Requirement 2: Join a Game (F2)

**User story:** As a voter, I want to join with just a link and my name so that there is no
friction.

1. WHEN a visitor opens a valid game link THE SYSTEM SHALL ask for a name before joining.
1. THE SYSTEM SHALL accept names of 1 to 30 characters after trimming whitespace.
1. IF the name is already used by another player in the game (case-insensitive) THEN THE
   SYSTEM SHALL reject it and ask for another name.
1. WHEN a voter joins THE SYSTEM SHALL issue a player token and show the voter to every
   player within 1 second.
1. WHEN a voter reloads the page or reconnects with the same token THE SYSTEM SHALL restore
   their place and their current vote without asking for the name again.
1. IF the game does not exist THEN THE SYSTEM SHALL show a clear "game not found" message
   with a link to create a new game.
1. THE SYSTEM SHALL show each player's connection status (online or offline).

## Requirement 3: Set the Story (F3)

**User story:** As a facilitator, I want to enter the story to estimate so that everyone
knows what we are voting on.

1. THE SYSTEM SHALL let only the facilitator set the story for the current round.
1. THE SYSTEM SHALL require a title of 1 to 200 characters and accept an optional link.
1. IF the link is not an absolute `http` or `https` URL THEN THE SYSTEM SHALL reject it.
1. THE SYSTEM SHALL show the story title to every player and open the link in a new tab with
   `rel="noopener noreferrer"`.
1. WHILE no story is set THE SYSTEM SHALL NOT allow voting.
1. WHILE votes are hidden THE SYSTEM SHALL let the facilitator edit the story title and link.

## Requirement 4: Voting (F4)

**User story:** As a voter, I want to pick a card in secret so that I am not influenced by
others.

1. THE SYSTEM SHALL offer the deck 0, 1, 2, 3, 5, 8, 13, 21, `?` and coffee.
1. WHILE votes are hidden THE SYSTEM SHALL let a voter pick, change or withdraw their vote.
1. WHILE votes are hidden THE SYSTEM SHALL show every player who has voted, but not the
   value.
1. THE SYSTEM SHALL NOT send any vote value to any client before the reveal, except that a
   voter is sent their own current vote (and only to their own connections) so that their
   deck shows it after a reload or reconnect (Requirement 2.5).
1. IF the facilitator tries to vote THEN THE SYSTEM SHALL reject it.
1. IF a vote is sent after the reveal THEN THE SYSTEM SHALL reject it.
1. IF a vote value is not in the deck THEN THE SYSTEM SHALL reject it.

## Requirement 5: Reveal and Results (F5)

**User story:** As a team, we want to see all votes at once so that we can discuss
differences.

1. THE SYSTEM SHALL let only the facilitator reveal the votes.
1. THE SYSTEM SHALL allow a reveal when at least one vote is cast, even if not everyone has
   voted.
1. WHEN the facilitator reveals THE SYSTEM SHALL show every player, within 1 second, each
   voter's card, the number of votes per card (distribution bars), and the average.
1. THE SYSTEM SHALL calculate the average over numeric votes only, rounded to one decimal.
1. THE SYSTEM SHALL show `?` and coffee votes but leave them out of the average and the
   consensus check.
1. WHEN all numeric votes are equal and there are at least two of them THE SYSTEM SHALL
   show that the team has reached consensus.
1. WHEN the numeric votes differ THE SYSTEM SHALL highlight the voters with the lowest and
   the highest vote as outliers.
1. IF there are no numeric votes THEN THE SYSTEM SHALL show "no average" and no consensus or
   outliers.
1. THE SYSTEM SHALL show voters who did not vote as "no vote".

## Requirement 6: Re-vote, Final Estimate and Next Story (F6)

**User story:** As a facilitator, I want to record the agreed estimate or vote again so that
the team ends each round with one number.

1. WHEN votes are revealed THE SYSTEM SHALL let the facilitator start a re-vote on the same
   story, which clears all votes and hides votes again.
1. WHEN votes are revealed THE SYSTEM SHALL let the facilitator pick a final estimate from
   the deck values 0 to 21.
1. THE SYSTEM SHALL suggest the consensus value, or the closest deck value to the average,
   as the default final estimate.
1. WHEN the facilitator records a final estimate THE SYSTEM SHALL add the story and estimate
   to the session summary.
1. WHEN the facilitator starts the next story THE SYSTEM SHALL clear all votes, hide votes,
   and ask the facilitator for the new story.
1. THE SYSTEM SHALL let the facilitator skip a story without an estimate; the summary shows
   it as "skipped".

## Requirement 7: Session Summary (F7)

**User story:** As a team, we want to see what we estimated so that we can update our
backlog after the session.

1. THE SYSTEM SHALL show every player a list of the stories in this game in the order they
   were estimated, with title, link and final estimate or "skipped".
1. THE SYSTEM SHALL show the total of the final estimates.
1. THE SYSTEM SHALL let any player copy the summary as plain text.
1. WHEN the game ends THE SYSTEM SHALL discard the summary.

## Requirement 8: Facilitator Reconnect and Removing Players (F8)

**User story:** As a facilitator, I want to keep control of my game so that a dropped
connection or an unwanted guest does not disrupt the session.

1. WHEN the facilitator disconnects THE SYSTEM SHALL keep the game running and show
   "facilitator offline" to voters.
1. WHILE the facilitator is offline THE SYSTEM SHALL let voters keep voting and SHALL NOT
   reveal, reset or change the story.
1. WHEN the facilitator reconnects from the same browser with the same link THE SYSTEM SHALL
   restore their facilitator role.
1. THE SYSTEM SHALL NOT pass the facilitator role to another player.
1. THE SYSTEM SHALL let the facilitator remove a voter. The removed voter's vote is
   discarded and they see "you were removed from this game".
1. IF a removed voter tries to rejoin with the same player token THEN THE SYSTEM SHALL
   reject it.

## Requirement 9: Game Lifetime (F1, F8)

**User story:** As a team, we want games to disappear after use so that no data is kept.

1. THE SYSTEM SHALL keep games in memory only and SHALL NOT write games, names, stories or
   votes to disk or a database.
1. WHEN no player has been connected to a game for 2 minutes THE SYSTEM SHALL delete the
   game.
1. THE SYSTEM SHALL tell players that a server restart ends all games.

## Requirement 10: Theme (F9)

**User story:** As a player, I want light or dark mode so that the app is comfortable to use.

1. THE SYSTEM SHALL follow the operating system's light/dark setting by default.
1. THE SYSTEM SHALL let each player switch between light and dark and remember the choice in
   their browser.
1. THE SYSTEM SHALL meet WCAG 2.1 AA contrast in both themes.

## Requirement 11: Azure DevOps Integration (F10, Later)

**User story:** As a facilitator, I want to pull stories from Azure DevOps and write the
estimate back so that I do not have to copy them by hand.

1. THE SYSTEM SHALL let the facilitator pick a story from an Azure DevOps query or backlog.
1. WHEN a final estimate is recorded THE SYSTEM SHALL offer to write it to the work item's
   story points field.

> Details to be refined when this feature is planned. It will need authentication against
> Azure DevOps, which conflicts with the "no accounts" approach for the MVP.

## Non-Functional Requirements

- **Real time:** state changes reach every player within 1 second (p95).
- **Scale:** at least 20 players per game and 100 games running at the same time on one
  server instance.
- **Security:** escape all user text (names, story titles) when displayed; validate every
  message on the server; check the facilitator role on the server for every facilitator
  action; rate-limit game creation and messages per IP; keep player tokens out of URLs and
  logs.
- **Accessibility:** WCAG 2.1 AA; cards can be picked with the keyboard; vote status and
  reveal results are announced to screen readers.
- **Devices:** works in current desktop and mobile browsers with no install.
- **Privacy:** no accounts, no cookies beyond the player token and theme choice, no
  analytics on names or stories.
