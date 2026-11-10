# halonic

Owner: liam · Layer: apps · Read the root `AGENTS.md` first; this file adds local rules.

## Scope

The `halonic` command-line tool: one folder per command under `src/commands`, help made from the commands.

This package may change only through tasks that name it. Its public API is `src/index.ts`;
everything else is internal.

## Commands

| Command                                                                                | What it does                                                               |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `pnpm exec turbo run test --filter=halonic -- --maxWorkers=2`                          | runs this package's tests (and the codegen they need)                      |
| `pnpm exec turbo run lint --filter=...[origin/main] --concurrency=2`                   | lints the packages your change touches and the ones that depend on them    |
| `pnpm exec turbo run test --filter=...[origin/main] --concurrency=2 -- --maxWorkers=2` | tests the packages your change touches and the ones that depend on them    |
| `pnpm exec turbo run typecheck --concurrency=2`                                        | typechecks all packages (HAL-2950); unchanged ones come from Turbo's cache |

Don't run `pnpm verify` by default: CI runs the full suite (HAL-2418).

## Local rules

- A command is thin: it parses its input, calls one app service and formats the result. Rules
  such as "only while the run is waiting" or "refuse an untrusted workspace" live in the service,
  which returns them as a result; the command only maps that result to output and an exit code
  ([details](../../docs/guides/code-style.md#thin-commands-and-screens)).
- A new command is a new folder `src/commands/<name>/` with `command.ts` exporting `<name>Command`.
  Never edit a shared list; `pnpm discover` writes `src/generated/commands.ts`.
- Exit codes: 0 ok, 1 errors found or the command failed (`internal`), 2 wrong usage
  (`invalid_input`), 3 the workspace isn't trusted, then the error kinds: 4 `not_found`,
  5 `conflict`, 6 `unauthenticated`, 7 `denied`, 8 `limit_reached`, 9 `unavailable`. Never
  renumber one; a new code takes the next free number. `exitCodeFor` is the only place that turns
  an error kind into an exit code. Commands write through `CliIo`, never to `process.stdout`
  directly.
- Only `printError` (`src/print-error.ts`) writes an error: the ✕ line, the fix line, `More:` and
  the code. Commands throw or return errors and never print them. The fix comes from the error's
  own `fix` field; with no `fix` there is no fix line, and a command never makes one up.
- Global options such as `--debug` are read once, in `runCli` (`src/global-options.ts`), and
  taken out of the command line before a command sees it. No command reads `--debug`: only
  `printError` uses it, to add the error's own text, causes and stack.
- Anything the CLI builds that takes `Secrets` (commands, the engine, providers, integrations)
  gets the instance `runCli` wrapped with `rememberedSecrets`, from the command's
  `context.secrets`, never a raw adapter. That wrapper tells `printError`'s scrubber every
  value it hands out; a raw adapter would let its secrets reach the screen unscrubbed.
