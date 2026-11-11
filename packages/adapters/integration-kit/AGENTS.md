# @halonicjs/adapter-integration-kit

Owner: liam · Layer: adapters · Read the root `AGENTS.md` first; this file adds local rules.

## Scope

The integration interface: the IntegrationHost an integration gets, with an HttpClient limited to the hosts and secrets of its permission sheet. Web types only.

This package may change only through tasks that name it. Its public API is the `exports` map in `package.json`:
`src/index.ts` (the host side) and `src/integration/index.ts` (the integration entry, published as
`@halonicjs/adapters/integration-kit`); everything else is internal.

## Commands

| Command                                                                                  | What it does                                                               |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `pnpm exec turbo run test --filter=@halonicjs/adapter-integration-kit -- --maxWorkers=2` | runs this package's tests (and the codegen they need)                      |
| `pnpm exec turbo run lint --filter=...[origin/main] --concurrency=2`                     | lints the packages your change touches and the ones that depend on them    |
| `pnpm exec turbo run test --filter=...[origin/main] --concurrency=2 -- --maxWorkers=2`   | tests the packages your change touches and the ones that depend on them    |
| `pnpm exec turbo run typecheck --concurrency=2`                                          | typechecks all packages (HAL-2950); unchanged ones come from Turbo's cache |

Don't run `pnpm verify` by default: CI runs the full suite (HAL-2418).

## Local rules

- The integration entry (`src/integration/`) imports no outside code and nothing of the host side: it ends up in
  every integration's cloud bundle. The host side takes the error classes from
  `src/integration/index.ts` only, never from the files behind it, so there is one copy of each.
