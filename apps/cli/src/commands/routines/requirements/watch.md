# cli.commands.routines.watch

- Status: active
- Since: 0.1.0
- Source: HAL-4844, HAL-187 item 7; the recorded version from HAL-6021 (`app.run-records-its-version`); the live version at each fire from HAL-6084 (`app.runs-read-latest-version`, `app.scheduler-live-routines`, plan approved by Liam); Ctrl C and SIGTERM from cli-output 1.5 (HAL-2022); the trust check of cli-output 3.4. cli-output has no section for `routines`; the words are team wording built on the `halonic run` lines, as HAL-2282 allows

The `halonic routines watch` command shall start the workspace's routines when they are due, in the foreground, with the routine scheduler on the local engine's tick, until Ctrl C or SIGTERM. It shall read the workspace as the Studio's routine scheduler does (`LiveRoutines`): on every tick, the routines of the live version, each On or Off as its saved file says, or the saved files with history off. It shall first refuse, with nothing written to the run log, a workspace whose history git can't open (exit 9, as `halonic run` refuses it), a workspace with history but nothing live yet (exit 5, with `halonic run`'s own line), and a workspace that isn't trusted on this computer and whose runs could reach more than the test model (exit 3); and check the sandbox for the workflows the routines start. Its first line shall say how many routines are on a clock and how to stop. For each run it starts, it shall print one finished line with the routine's name, the run's short id and the due time; for a run that didn't start, a ✕ line, with the reason under `--debug`. Each workflow run it starts shall read the live version at the time the routine is due, start with that version's definitions, and record it on its `run.started` (its commit and date, or the saved files with history off). A version made while it watches shall count from the next tick. Before a run starts from a version, that version shall pass the trust check and the sandbox check for the run's workflow, and keep the workspace's local only as the watch started with it; a version that doesn't starts no run, and the run's ✕ line says so under `--debug`. While it watches, the timers of waiting runs shall fire when they are due. When a run's step keeps failing (its timer fails three times), it shall print a ✕ line with the routine's name and the run's short id, with the reason under `--debug`, and keep watching while the engine keeps retrying that step; `halonic run` stops at such a run instead. Once that step has kept failing for an hour, from its first failure in a row, the watch shall give up on the run: it cancels the run, or, when cancelling fails too, stops trying that step until the next watch or run, prints a ✕ line with the routine's name and the run's short id, with the reason and whether the run was cancelled under `--debug`, and keeps watching. Three failed ticks in a row shall stop the watch with the last error, and a tick that works starts that count again. Ctrl C shall stop it with "Stopped." and exit 130, SIGTERM with exit 143, and the engine shall be closed either way.

## Examples

- Given a routine that runs Follow up every hour, at 14:01,
  when `halonic routines watch` is run,
  then it prints "Watching 1 routine in Acme. Stop with Ctrl C.".
- Given that watch, when the clock passes 15:00,
  then it starts the run due at 15:00 and prints "✓ Started Hourly follow-up · run <id> · due 15:00".
- Given that run, in a workspace with history off,
  then its `run.started` records `{ reads: "saved-files" }`.
- Given a workspace whose live version waits 5 minutes in Follow up, with a saved change to 1 minute and a saved routine that was never made live,
  when the watch starts and the clock passes 15:00,
  then it prints "Watching 1 routine in Acme. Stop with Ctrl C.", and the run waits 5 minutes and records `{ reads: "live-version", commit: <the live commit>, versionDate }`.
- Given a new version made while the watch runs,
  when the next routine is due,
  then its run starts from that version and records its commit.
- Given a new version that adds an Ollama provider the workspace isn't trusted for, or turns local only on,
  when the routine is due,
  then the watch prints "✕ Hourly follow-up didn't start · due 15:00 · see why with --debug" and keeps watching.
- Given a workspace with history but nothing live yet,
  when `halonic routines watch` is run,
  then it stops with "✕ Nothing is live yet, so there is nothing to run. Nothing ran." and exit 5.
- Given a workspace with history where git can't start,
  when `halonic routines watch` is run,
  then it stops with "✕ Couldn't watch the routines in acme: git can't start on this computer, so the live version can't be read. Nothing ran." and exit 9.
- Given that run waits at a step that moves on after 5 minutes,
  when the clock passes the timer's due time,
  then the timer fires and the run finishes.
- Given a run of Hourly follow-up whose step failed three times,
  then the watch prints "✕ Hourly follow-up got stuck · run <id> · see why with --debug" and keeps watching.
- Given that run's step still fails an hour after its first failure,
  then the watch cancels the run, prints "✕ Gave up on Hourly follow-up after an hour · run <id> · see why with --debug" and keeps watching.
- Given a watch whose tick fails, works, fails, works and fails,
  then it keeps watching; three failed ticks in a row stop it with the last error.
- Given a routine whose workflow isn't in its hub,
  when it is due,
  then the watch prints "✕ <name> didn't start · due 15:00 · see why with --debug" and keeps watching.
- Given a watch that is running,
  when Ctrl C is pressed,
  then it prints "Stopped." and exits 130; on SIGTERM it exits 143.
- Given a workspace with an Ollama provider that isn't trusted,
  when `halonic routines watch` is run,
  then it stops with "✕ Couldn't watch the routines in acme: Acme isn't trusted on this computer yet. Nothing ran.", exit 3, and the run log stays empty.
