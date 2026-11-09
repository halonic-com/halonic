# halonic

The `halonic` command-line tool. It uses the same core packages as the Studio, and every command
lives in its own folder.

- **Layer:** apps
- **Owner:** liam
- **Public API:** `halonic` (`runCli`, the command types and the exit codes, so tests and the parity
  harness can run the CLI in-process)

## Commands

| Command                   | What it does                                                              |
| ------------------------- | ------------------------------------------------------------------------- |
| `halonic schema [outDir]` | writes the JSON Schema of every file kind to `outDir` (default `schemas`) |

`validate`, `test`, `run`, `init`, `extract` and `routines` follow in HAL-187 as the workspace
loader and the engine land. `halonic --help` lists the commands; `halonic <command> --help` shows
one command's arguments and options.

## Exit codes

| Code | Meaning                                                                  |
| ---- | ------------------------------------------------------------------------ |
| 0    | it worked                                                                |
| 1    | the command ran and found errors, or failed                              |
| 2    | the command line was wrong (unknown command or option, missing argument) |
| 3    | the workspace isn't trusted on this machine, so nothing was started      |

## Adding a command

1. Make a folder `src/commands/<name>/` with a `command.ts` that exports `<name>Command`
   (`run-tests` exports `runTestsCommand`), a `CliCommand`.
2. Put its requirements in `src/commands/<name>/requirements/` and its tests next to it.
3. Run `pnpm discover`. It writes the gitignored `src/generated/commands.ts`; turbo also runs it
   before every typecheck, test and build. No shared file changes, and the help is made from each
   command's `usage`, `summary` and `options`.

A command prints through the `CliIo` it is given, never `console`, and throws `UsageError` for a
wrong command line. Any other error ends the command with exit code 1 and its message.
