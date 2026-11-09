# @halonicjs/adapter-model-openai

Owner: tomas · Layer: adapters · Read the root `AGENTS.md` first; this file adds local rules.

## Scope

The OpenAI-compatible model adapter: chat calls and streaming over `/v1/chat/completions` for openai, openai-compatible, ollama and lmstudio providers. The factories come in a later pull request of HAL-2284.

This package may change only through tasks that name it. Its public API is `src/index.ts`;
everything else is internal.

## Commands

| Command                                                                                | What it does                                                               |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `pnpm exec turbo run test --filter=@halonicjs/adapter-model-openai -- --maxWorkers=2`  | runs this package's tests (and the codegen they need)                      |
| `pnpm exec turbo run lint --filter=...[origin/main] --concurrency=2`                   | lints the packages your change touches and the ones that depend on them    |
| `pnpm exec turbo run test --filter=...[origin/main] --concurrency=2 -- --maxWorkers=2` | tests the packages your change touches and the ones that depend on them    |
| `pnpm exec turbo run typecheck --concurrency=2`                                        | typechecks all packages (HAL-2950); unchanged ones come from Turbo's cache |

Don't run `pnpm verify` by default: CI runs the full suite (HAL-2418).

## Local rules

- (none yet; the owner adds rules here when a mistake repeats)
