# @halonicjs/words

Owner: liam · Layer: core · Read the root `AGENTS.md` first; this file adds local rules.

## Scope

The sentences the CLI and Studio share, as parts a terminal or a page can draw: the phrase builder, the catalogue and the doctor's words.

This package may change only through tasks that name it. Its public API is `src/index.ts`;
everything else is internal.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm exec turbo run test --filter=@halonicjs/words -- --maxWorkers=2` | runs this package's tests (and the codegen they need) |
| `pnpm exec turbo run lint --filter=...[origin/main] --concurrency=2` | lints the packages your change touches and the ones that depend on them |
| `pnpm exec turbo run test --filter=...[origin/main] --concurrency=2 -- --maxWorkers=2` | tests the packages your change touches and the ones that depend on them |
| `pnpm exec turbo run typecheck --concurrency=2` | typechecks all packages (HAL-2950); unchanged ones come from Turbo's cache |

Don't run `pnpm verify` by default: CI runs the full suite (HAL-2418).

## Local rules

- Words only: no facts, no I/O, no Node or browser APIs. A sentence that needs a fact takes it as a
  parameter; the facts come from `@halonicjs/app`.
- A sentence that names a command takes the finished command as text. Quoting a folder for a
  shell is the CLI's job (`suggestedCommand`).
