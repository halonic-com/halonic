# @halonicjs/adapter-toolscript-check

Owner: elena · Layer: adapters · Read the root `AGENTS.md` first; this file adds local rules.

## Scope

Checks a ToolScript against the profile rules P1–P7 and builds its artifact with the TypeScript compiler API.

This package may change only through tasks that name it. Its public API is `src/index.ts`;
everything else is internal.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm exec turbo run test --filter=@halonicjs/adapter-toolscript-check -- --maxWorkers=2` | runs this package's tests (and the codegen they need) |
| `pnpm exec turbo run lint --filter=...[origin/main] --concurrency=2` | lints the packages your change touches and the ones that depend on them |
| `pnpm exec turbo run test --filter=...[origin/main] --concurrency=2 -- --maxWorkers=2` | tests the packages your change touches and the ones that depend on them |
| `pnpm exec turbo run typecheck --concurrency=2` | typechecks all packages (HAL-2950); unchanged ones come from Turbo's cache |

Don't run `pnpm verify` by default: CI runs the full suite (HAL-2418).

## Local rules

- The TypeScript JS API comes from `@typescript/typescript6` (its `runtimeIn` entry in
  `tooling/check/dependencies.json`) until TypeScript 7.1 ships its own; then switch and drop the entry.
- The API is several MB: Studio loads this package lazily (`import()`), never at startup (HAL-17568).
- Every message is in `src/messages.ts`, so the CLI and Studio show the same words.
- Fixtures are `src/fixtures/<name>.tool.ts.txt`: they break the repo's own rules on purpose
  (an outside import, `eval`), so they're text that no check, lint or coverage reads.
