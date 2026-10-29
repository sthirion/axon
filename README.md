# Planning Poker (Axon)

Real-time Planning Poker for agile teams. A facilitator creates a game and shares a link;
voters join with just a name, pick a Fibonacci card in secret, and see every vote at once
when the facilitator reveals them. No accounts, and nothing is stored: games live in memory
and disappear when everyone leaves.

## Features (MVP)

- Create a game and share the join link
- Join with a name only; reconnect without losing your seat
- Facilitator sets the story (title and optional link) for each round
- Hidden voting with the Fibonacci deck (1, 2, 3, 5, 8, 13, 21, `?`, coffee), an incremental deck (1 to 10) or t-shirt sizes (XS to XL)
- Reveal with individual votes, distribution, average, consensus and outliers
- Re-vote, record the final estimate, or skip; session summary with total
- Facilitator can reconnect and remove players
- Light and dark theme

Planned later: Azure DevOps integration.

## Tech Stack

| Part            | Technology                                        |
| --------------- | ------------------------------------------------- |
| Server          | Node.js 20, TypeScript, Express, Socket.IO        |
| Client          | React 19, TypeScript, Vite, Tailwind CSS, Zustand |
| Shared contract | Zod schemas and types used by server and client   |
| Tests           | Vitest, `socket.io-client`, Playwright, axe-core  |

## Project Structure

```text
src/
├── axon/             # Express + Socket.IO server
├── axon.Shared/      # Zod schemas, card deck, event and state types
├── axon.Frontend/    # React app
└── axon.E2ETests/    # Playwright end-to-end tests
```

## Getting Started

```bash
npm ci
npm run dev      # server + Vite dev server
npm run build    # production build
```

Open the app, create a game, and open the join link in another browser profile to add
voters.

## Running it

Build once, then start the server. It serves the API, Socket.IO and the built client from a
single process:

```bash
npm ci
npm run build
npm start -w src/axon
```

| Variable            | Default                  | Meaning                                |
| ------------------- | ------------------------ | -------------------------------------- |
| `PORT`              | `3000`                   | Port to listen on                      |
| `STATIC_DIR`        | `src/axon.Frontend/dist` | Built client to serve                  |
| `GAME_EMPTY_TTL_MS` | `120000` (2 minutes)     | How long an empty game is kept         |
| `GAME_MAX_AGE_MS`   | `7200000` (2 hours)      | Maximum age of any game                |
| `SWEEP_INTERVAL_MS` | `30000` (30 seconds)     | How often expired games are cleaned up |

`GET /healthz` returns the server status. Games live in memory, so run a single instance and
expect games to be lost on restart.

Put the server behind a reverse proxy for TLS. The proxy must pass WebSocket upgrades
(`Upgrade` and `Connection` headers) through to Socket.IO, and should set
`X-Forwarded-For` and `X-Forwarded-Proto`. Deployment scripts are not part of this repo; fork
it and use whatever suits your hosting.

## Documentation

- Specs: [requirements, design and tasks](.github/memorybank/features/planning-poker/)
- Project conventions: [.github/project-config.md](.github/project-config.md)
- Development workflow with Copilot agents (ADLC): [.github/ADLC.md](.github/ADLC.md)

## Contributing

Suggestions and pull requests are welcome; see [CONTRIBUTING.md](CONTRIBUTING.md). The hosted
instance is deployed by the maintainer from tagged releases.

## Development Workflow

Work is tracked as [GitHub issues](https://github.com/sthirion/axon/issues). Each story is
built with the `@story` agent (`@story /start <issue#>`), one at a time, merging each PR
before starting the next.
