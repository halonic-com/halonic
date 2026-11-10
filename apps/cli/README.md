# halonic

The `halonic` command-line tool. It uses the same core packages as the Studio, and every command
lives in its own folder.

- **Layer:** apps
- **Owner:** liam
- **Public API:** `halonic` (`runCli`, the command types and the exit codes, so tests and the parity
  harness can run the CLI in-process)

## Commands

| Command                      | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `halonic doctor`             | checks that this computer can run Halonic: models, sandbox, disk; `--dir <folder>` picks the workspace                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `halonic init [folder]`      | lays out a new, empty workspace in `folder`, or in the current folder when it's empty, and never writes into a folder with files in it (exit 5); `--example acme` copies the Acme example instead, into `./acme` when no folder is named                                                                                                                                                                                                                                                                                        |
| `halonic run <workflow>`     | starts a workflow (`hub/workflow` when several hubs have it) in this computer's engine and follows it step by step; `--input <file or JSON>`, `--event <event>` (answers a wait, once per wait, in order), `--dir <folder>`. It refuses a workspace that isn't trusted here (exit 3) unless the run can only reach the test model (every provider `mock`, no connector, no agent in a harness). Exit 0 when the run finished or waits for you, 1 when it failed; Ctrl C or SIGTERM stops following it and says it was cancelled |
| `halonic runs`               | lists the workspace's latest runs, newest first; `--status <status>`, `--workflow <id>`, `--limit <n>`, `--dir <folder>`                                                                                                                                                                                                                                                                                                                                                                                                        |
| `halonic runs show <run-id>` | shows what one run did                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `halonic schema [outDir]`    | writes the JSON Schema of every file kind to `outDir` (default `schemas`)                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `halonic trust`              | shows what a workspace can start and asks to trust it on this computer; `--yes --fingerprint <fingerprint>` without a question, `--list`, `--remove` (exit 3 on No); `--json` lists what changed since it was trusted                                                                                                                                                                                                                                                                                                           |
| `halonic validate`           | checks every file of the workspace (`--dir`, default the current folder) and lists its problems by file, 20 at most without `--all`; exit 1 on an error, or on a warning with `--strict`                                                                                                                                                                                                                                                                                                                                        |

The sandbox check before a run (`checkRunSandbox` in `src/sandbox-gate.ts`, HAL-1709) is written
and tested, but `halonic run` doesn't call it yet. Once it does, a workflow with an agent that
starts a program on this computer is refused with exit 9 when the sandbox can't start, and an
agent set to "On this computer" gets one `!` line instead. No option will skip it.

`test`, `extract` and `routines` follow in HAL-187 as the workspace
loader and the engine land. `halonic --help` lists the commands and the options every command
takes (`--debug`, `--help`); `halonic <command> --help` shows one command's arguments and options.

## Exit codes

| Code | Meaning                                                                  |
| ---- | ------------------------------------------------------------------------ |
| 0    | it worked                                                                |
| 1    | the command ran and found errors, or failed                              |
| 2    | the command line was wrong (unknown command or option, missing argument) |
| 3    | the workspace isn't trusted on this machine, so nothing was started      |
| 4    | not found: the thing asked for doesn't exist (`not_found`)               |
| 5    | conflict: its state doesn't allow this now (`conflict`)                  |
| 6    | signed out: a sign-in is missing or has expired (`unauthenticated`)      |
| 7    | not allowed: a rule says no (`denied`)                                   |
| 8    | limit reached: a rate limit, quota or budget ran out (`limit_reached`)   |
| 9    | unavailable: something Halonic needs is down; try again (`unavailable`)  |

1 is also a bug on our side (`internal`) and 2 a wrong value or file (`invalid_input`). The codes
never change meaning once released. `halonic --help` lists them too.

## Adding a command

1. Make a folder `src/commands/<name>/` with a `command.ts` that exports `<name>Command`
   (`run-tests` exports `runTestsCommand`), a `CliCommand`.
2. Put its requirements in `src/commands/<name>/requirements/` and its tests next to it.
3. Run `pnpm discover`. It writes the gitignored `src/generated/commands.ts`; turbo also runs it
   before every typecheck, test and build. No shared file changes, and the help is made from each
   command's `usage`, `summary` and `options`.

A command with subcommands, such as `runs show`, keeps them in its own folder and
lists them in its `subcommands` field, each a `CliCommand` named by its own word. The CLI hands
`halonic runs show <run-id>` to `show`, lists the subcommands in `halonic runs --help` and gives
the usage error for a word that isn't one of them, so the command never switches on its first
argument. A subcommand goes right after its command: for `halonic runs --limit 5 show <run-id>` the
CLI says `show` goes right after `runs`, before any options. A command that only hands off, such as `plugin`, leaves out `run`.

A command prints through the `CliIo` it is given, never `console`, and throws `UsageError` for a
wrong command line. It never prints an error itself: it throws a `KindedError` (with a `fix` when
there is a next step to suggest), and `printError` prints it and ends the command with the exit code
of its kind. An error without a kind is a bug: the CLI says so and exits with 1, without showing the
error's own text. Run it again with `--debug` (before or after the command) to see that text, its
causes and its stack, for a bug report.

A command that wants to tell an engineer something while it runs, such as a retry that may still
work out, passes the line to `context.debug`. It shows on stderr only with `--debug`, with loaded
secrets removed, and is never part of the result, so stdout and `--json` stay the same.

A command returns all its lines at the end. A line that is already final, such as a step's ✓ line
while a run goes on, it may also pass to `context.printAhead`: the CLI prints it at once (also
through a pipe and in CI, not with `--json`) and leaves it out at the end. The lines printed ahead
must be the first lines of the result, word for word; if they aren't, the CLI prints the whole
result, and the CLI's tests fail (`src/test/print-ahead-check.spec.ts` runs after every test).
