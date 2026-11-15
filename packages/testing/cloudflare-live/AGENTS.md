# @halonicjs/testing-cloudflare-live

Owner: mateo · Layer: testing · Read the root `AGENTS.md` first; this file adds local rules.

## Scope

The live suites of the Cloudflare target: checks of a deployed Worker over the network, run by
`pnpm test:live` (the `live-cloud` workflow) against the CI Cloudflare account. So far: the webhook checks, the smoke, admin-key and export round-trip checks (`live/transfer.live.test.ts`), and the fixture (`live/fixture.setup.ts`) that deploys the Worker they call and deletes it afterwards.

This package may change only through tasks that name it. Its public API is `src/index.ts`;
everything else is internal.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm exec turbo run test --filter=@halonicjs/testing-cloudflare-live -- --maxWorkers=2` | runs this package's tests (and the codegen they need) |
| `pnpm exec turbo run lint --filter=...[origin/main] --concurrency=2` | lints the packages your change touches and the ones that depend on them |
| `pnpm exec turbo run test --filter=...[origin/main] --concurrency=2 -- --maxWorkers=2` | tests the packages your change touches and the ones that depend on them |
| `pnpm --filter @halonicjs/testing-cloudflare-live test:live` | runs the live suites; needs the `cloudflare-live` environment's secrets, so only CI runs it |
| `pnpm exec turbo run typecheck --concurrency=2` | typechecks all packages (HAL-2950); unchanged ones come from Turbo's cache |

Don't run `pnpm verify` by default: CI runs the full suite (HAL-2418).

## Local rules

- A live suite never prints a token, a secret or the account ID, and creates only names that start with `hlt-`.
- Changes here need Julian's review (HAL-6701): the code runs with the test account's token.
