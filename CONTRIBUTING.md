# Contributing

Suggestions, bug reports and pull requests are welcome.

## Before you start

- For anything larger than a small fix, open an issue first so we can agree on the approach.
- Keep pull requests focused: one change per PR.

## Setup

```bash
npm ci
npm run dev
```

Node.js 20 or later is required.

## Checks

Run these before opening a pull request:

```bash
npm run lint
npm run typecheck
npm run test:unit
npm run test:integration
npm run test:frontend
```

`npm run test:e2e` runs the Playwright suite; run it when you change the UI.

## Releases and deployment

Merged changes are released and deployed by the maintainer. Contributors do not need to deploy
anything, and the repository does not include deployment scripts. You are free to fork the
project and host your own copy however you like.
