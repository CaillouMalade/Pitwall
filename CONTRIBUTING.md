# Contributing to Pitwall

Changes should make race-weekend weather clearer and keep the app easy to run locally.

## Setup

Use Node.js 22.13 or newer. Run `npm ci`, then `npm run dev`. The normal app runs at localhost:4173; development uses 5173 and browser tests use 4174, each with its own browser storage.

Before proposing a change:

```sh
npm run check
npx playwright install chromium firefox webkit
npm run test:e2e
```

`check` runs lint, formatting, unit tests, TypeScript and a production build. `npm run test:e2e -- --project=chromium` is quicker while working. CI checks Windows and Ubuntu.

## Weather rules

- Keep missing values missing; never turn an unknown rain amount into 0 mm.
- Compare providers on the same 3-hour UTC windows. Never average wind directions.
- Show every failure as a fixed, user-facing message, never a raw error or URL.
- Respect provider quotas, terms and attribution. Tests use synthetic answers and never call the services.

## Code

Views live in `web/src/components/`; calculations live in `web/src/lib/` and stay independent of React. Unit tests in `tests/` run with `node --test`; browser tests are in `e2e/`.

Use `npm run format` before committing. Keep changes focused, describe the user-visible result and add a test for a real bug or new behaviour. Include screenshots when the interface changes.

Do not commit keys, `.env` files, browser profiles, build output or dependencies. AI assistance is welcome when disclosed with a co-author trailer.

By contributing original work, you agree to license it under the repository's MIT licence.
