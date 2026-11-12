# halonic

The `halonic` command-line tool. It uses the same core packages as the Studio, and every command
lives in its own folder.

- **Layer:** apps
- **Owner:** liam
- **Public API:** `halonic` (`runCli`, the command types and the exit codes, so tests and the parity
  harness can run the CLI in-process)

## Commands

| Command | What it does |
| --- | --- |
| `halonic doctor` | checks that this computer can run Halonic: sandbox, disk, and a workspace's models; `--dir <folder>` picks the workspace. It asks a local model server on this computer (`localhost`, `127.0.0.0/8`, `::1`) always, and one at any other address only once the workspace is trusted here; before that, such a server shows as not answering and nothing is sent to it |
| `halonic extract <hub> <new-folder>` | moves one hub, with the shared items it uses, into a new workspace in an empty `new-folder`; the workspace it comes from (`--dir`) is left as it is. `--dry-run` lists the files and writes nothing. Exit 4 for an unknown hub, 5 when the workspace has errors or the folder isn't empty |
| `halonic init [folder]` | lays out a new, empty workspace in `folder`, or in the current folder when it's empty, and never writes into a folder with files in it (exit 5); `--example acme` copies the Acme example instead, into `./acme` when no folder is named |
| `halonic plugin list` | lists the plugins in this computer's profile (`halonic plugin` alone does the same), one line each with four columns: name, version, where it was added from (a git address without the scheme and `.git`, then `@` and the first seven characters of the commit, or a folder with the home folder written `~`) and whether it is on (✓ on, ! not trusted yet, ! changed since you trusted it, or ✕ for a folder that can't be read or checked, which doesn't stop the others); `--json` gives each plugin's id, name, version, status and source. It writes nothing and needs no trust, and exits 0 when it lists, empty or not |
| `halonic routines` | lists the workspace's routines in the order of their files, one line each: the name, its trigger in words, its next run ("Next 16 Nov 09:00", "Off" or "No set time") and its last run ("Never ran" when it hasn't); the name is followed by the hub's id when routines come from more than one hub, so two of the same name can be told apart; `--json`, `--dir <folder>`. It starts nothing, writes nothing and needs no trust |
| `halonic routines watch` | in the foreground, starts the routines when they are due and moves on the runs that wait for a time, until Ctrl C ("Stopped.", exit 130) or SIGTERM (exit 143); `--dir <folder>`. It checks trust and the sandbox first, as `run` does: exit 3 for a workspace that isn't trusted here, unless its runs can only reach the test model. Its first line, "Watching 1 routine in acme. Stop with Ctrl C.", comes before any run's line, also for runs the catch-up tick starts. Then it prints one line per run it starts and a ✕ line for one that didn't start. A run whose step fails three times gets "✕ Hourly follow-up got stuck · run 09d9f0 · see why with --debug" and the watch keeps going while the engine retries that step. Three failed ticks or wake-ups in a row stop it with the last error, and one that works starts that count again |
| `halonic run <workflow>` | starts a workflow (`hub/workflow` when several hubs have it) in this computer's engine and follows it step by step, printing each step's line as the step ends; `--input <file or JSON>`, `--event <event>` (answers a wait, once per wait, in order), `--dir <folder>`. `--input` takes a JSON object; a missing file, a folder, a file it can't read or JSON that isn't an object is refused with a reason (exit 2). An `--event` the step doesn't take, or for a run that is gone, is refused in `runs send`'s words; a wait someone else answered first (such as in Studio) is no error, and if the run ended before it took the last `--event`s, one dim line says so ("! Didn't use --event reject: the run ended first."). It refuses a workspace that isn't trusted here (exit 3) unless the run can only reach the test model (every provider `mock`, no connector, no local integration, no agent in a harness; the rule is `reachesOnlyTheTestModel` in `@halonicjs/workspace`, which Studio can use too). A workflow with an agent in a harness is refused before that check (exit 9, below), so it shows no trust check. Exit 0 when the run finished or waits for you, 1 when it failed; Ctrl C or SIGTERM stops following it and says it was cancelled, or, when the engine couldn't cancel it, that it "wasn't cancelled, only no longer followed, so it may go on" and points to `halonic runs show`. A run that failed with `sandbox-not-ready` (here and in `runs show`) is worded from its `sandboxReason` code alone: the sandbox can't start on this computer, with the same reason and fix as a refused run (`cli.run-failed-sandbox`). With `--debug`, a retry of a failing engine timer shows on stderr ("try 2 of 3, retrying"); the third failure of the same timer stops the command with its error |
| `halonic runs` | lists the workspace's latest runs, newest first; `--status <status>`, `--workflow <id>`, `--limit <n>`, `--dir <folder>` |
| `halonic runs show <run-id>` | shows what one run did |
| `halonic runs send <run-id> <event>` | answers a run that waits for you, by its short or full id, only while it waits for that event, then follows it until it ends or waits again, as `run` does; `--json` gives `run` and `events`. Trust and the sandbox are checked first, and a refusal says "Nothing was sent." (exit 3 or 9). Exit 5 when the run isn't waiting, 2 for an event the step doesn't take, 4 for an unknown id |
| `halonic schema [outDir]` | writes the JSON Schema of every file kind to `outDir` (default `schemas`) |
| `halonic test` | runs the workspace's workflow tests (`--dir`) through `@halonicjs/test-runner` with the test model and in-memory stores, so it reaches no provider, starts no program and needs no trust; `--filter <text>` keeps the tests whose `hub/workflow/name` contains the text (exit 2 when none does), `--list` lists them without running. Exit 1 when a test failed. Knowledge sources aren't built in tests yet (HAL-4458) |
| `halonic trust` | shows what a workspace can start and asks to trust it on this computer. It reads the files again after the answers and trusts only what the check showed: files that changed meanwhile are refused (exit 3) with the fingerprint they have now. `--yes --fingerprint <fingerprint>` without a question, `--list`, `--remove` (exit 3 on No); `--json` lists what changed since it was trusted |
| `halonic validate` | checks every file of the workspace (`--dir`, default the current folder) and lists its problems by file, 20 at most without `--all`; exit 1 on an error, or on a warning with `--strict` |

Before it starts a run, or sends an event to one, `halonic run` and `halonic runs send` check the
sandbox (`checkRunSandbox` in `src/sandbox-gate.ts`, called from `openWorkspaceEngine`). A workflow
with an agent that starts a program on this computer is refused with exit 9 when the sandbox can't
start. No option skips it. The engine `run` opens has no harness adapter yet, so `run` also refuses, with exit 9 and before anything starts, a workflow with an agent in a harness (an agent set to "On this computer" included). The message names the harness the run would use: the workflow's own `harness` when it sets one, else the agent's.
`halonic doctor` shows the same check as its Sandbox line, ✕ with exit 1 when the sandbox can't
start. Each reason code (`windows`, `container`, `user-namespaces-restricted`, `bubblewrap-missing`,
`linux-tools-missing` when `socat` or ripgrep is missing, `other`) has its own words and fix in
`src/messages/sandbox.ts`; the codes the `Sandbox` port added in version 6 (setup, WSL, company
policy and sign-in) read as `other` until the sandbox design words them. The check's own sentence
shows only with `--debug`.

Every `halonic plugin` command opens the plugin service with `openPluginService`
(`src/plugin-host.ts`): the profile's plugins folder and records, and the trust records plugins share
with workspaces, so they all read a plugin the same way. Nothing is created until a plugin is added.

A command that starts or moves on a run opens the workspace's engine with `openWorkspaceEngine`
(`src/workspace-engine.ts`): the stuck-step watch, and one signal that Ctrl C, SIGTERM or a step that
keeps failing aborts. It wraps the follow in `followUntilStopped` (`src/follow-run.ts`), which turns
Ctrl C into what stopping meant ("The run 01jd8q was cancelled after the step Classify it", or
"wasn't cancelled, only no longer followed, so it may go on" when the cancel failed) and
rethrows a stuck step's last error. `halonic run` and `halonic runs send` both use them, so there
is one engine opener.

`halonic routines watch` passes `openWorkspaceEngine` an `onStuck`, so a stuck step is
reported and the watch goes on; without it, as for `run` and `runs send`, the step's last error
stops the command. `halonic --help` lists the commands and the options every command
takes (`--debug`, `--help`); `halonic <command> --help` shows one command's arguments and options.

The CLI shows a path with the system's separator (`.\acme` on Windows). `halonic trust --list`
shows each trusted folder from the current folder's real path, because a trust record holds the
folder's real path: through a link, or a Windows short name such as `RUNNER~1`, `./acme` still
shows as `./acme`, not as `../../…/acme`.

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | it worked |
| 1 | the command ran and found errors, or failed |
| 2 | the command line was wrong (unknown command or option, missing argument) |
| 3 | the workspace isn't trusted on this machine, so nothing was started |
| 4 | not found: the thing asked for doesn't exist (`not_found`) |
| 5 | conflict: its state doesn't allow this now (`conflict`) |
| 6 | signed out: a sign-in is missing or has expired (`unauthenticated`) |
| 7 | not allowed: a rule says no (`denied`) |
| 8 | limit reached: a rate limit, quota or budget ran out (`limit_reached`) |
| 9 | unavailable: something Halonic needs is down; try again (`unavailable`) |

1 is also a bug on our side (`internal`) and 2 a wrong value or file (`invalid_input`). The codes
never change meaning once released. `halonic --help` lists them too.

## Parity with the old CLI

`src/parity.test.ts` makes the 13 calls of the old CLI's `studio test` and `studio run` again with
`halonic test` and `halonic run`, each on a fresh copy of the parity base fixture, from the old fixed
clock, with IDs counted from 1 and the fixture trusted through the in-memory trust store. Each call
is compared with the recording `cli.json` (exit code, stdout, stderr, and every stored run with its
events in order). A difference must be named by an allowed difference's `cliRules`, or by a known gap
that names the call and the task that fixes it; a rule or a gap that no longer applies fails the
test. The compare, the rules and both lists live in `@halonicjs/testing-parity`; see its README
(CLI calls). The requirement is `requirements/parity-cli-calls.md`.

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
