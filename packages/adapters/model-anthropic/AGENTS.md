# @halonicjs/adapter-model-anthropic

Owner: tomas · Layer: adapters · Read the root `AGENTS.md` first; this file adds local rules.

## Scope

The Anthropic model adapter: chat calls over the Messages API (`/v1/messages`) on the built-in `fetch`, with no SDK, and streaming over server-sent events. The factory comes in a later pull request of HAL-2921.

This package may change only through tasks that name it. Its public API is `src/index.ts`;
everything else is internal.

## Commands

| Command                                                                                  | What it does                                                               |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `pnpm exec turbo run test --filter=@halonicjs/adapter-model-anthropic -- --maxWorkers=2` | runs this package's tests (and the codegen they need)                      |
| `pnpm exec turbo run lint --filter=...[origin/main] --concurrency=2`                     | lints the packages your change touches and the ones that depend on them    |
| `pnpm exec turbo run test --filter=...[origin/main] --concurrency=2 -- --maxWorkers=2`   | tests the packages your change touches and the ones that depend on them    |
| `pnpm exec turbo run typecheck --concurrency=2`                                          | typechecks all packages (HAL-2950); unchanged ones come from Turbo's cache |

Don't run `pnpm verify` by default: CI runs the full suite (HAL-2418).

## Local rules

- (none yet; the owner adds rules here when a mistake repeats)
