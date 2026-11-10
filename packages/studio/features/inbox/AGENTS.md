# @halonicjs/studio-feature-inbox

Owner: elena · Layer: studio · Read the root `AGENTS.md` first; this file adds local rules.

## Scope

The Studio Inbox: what waits for you (approvals and wait steps), its count, and your answers.

This package may change only through tasks that name it. Its public API is `src/index.ts`, plus `src/api.ts` for other features;
everything else is internal.

## Commands

| Command                                                                                | What it does                                                               |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `pnpm exec turbo run test --filter=@halonicjs/studio-feature-inbox -- --maxWorkers=2`  | runs this package's tests (and the codegen they need)                      |
| `pnpm exec turbo run lint --filter=...[origin/main] --concurrency=2`                   | lints the packages your change touches and the ones that depend on them    |
| `pnpm exec turbo run test --filter=...[origin/main] --concurrency=2 -- --maxWorkers=2` | tests the packages your change touches and the ones that depend on them    |
| `pnpm exec turbo run typecheck --concurrency=2`                                        | typechecks all packages (HAL-2950); unchanged ones come from Turbo's cache |

Don't run `pnpm verify` by default: CI runs the full suite (HAL-2418).

## Local rules

- **Ask for changes is desktop only until the phone sheet lands (HAL-4008).** The card's dialog is the desktop form (flow-inbox 5.3); a phone gets a full-screen sheet (flow-inbox 8.2, HAL-1305). Don't make the cards reachable on a narrow window before that sheet is in.
