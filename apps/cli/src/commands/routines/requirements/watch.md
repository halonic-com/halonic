# cli.commands.routines.watch

- Status: active
- Since: unreleased
- Source: HAL-4844, HAL-187 item 7; the recorded version from HAL-6021 (`app.run-records-its-version`); the live version at each fire from HAL-6084 (`app.runs-read-latest-version`, `app.scheduler-live-routines`, plan approved by Liam); Ctrl C and SIGTERM from cli-output 1.5 (HAL-2022); the trust check of cli-output 3.4; the webhook routines' line, HAL-14299; a routine whose file has errors is left out and the others start, HAL-15372 (C565 row 1), as `halonic routines` lists it and the Studio's scheduler starts the others; the line when its file is fixed, HAL-15664 (C610 #3); the line when the fix is saved but not committed, HAL-15863 (C642 #2). A routine whose agent is in a harness is left out the same way, HAL-15396 (C570 #2), where it used to stop the whole watch (HAL-13857). cli-output has no section for `routines`; the words are team wording built on the `halonic run` lines, as HAL-2282 allows; the first line when no routine can start, HAL-16057 (C666 #2)

The `halonic routines watch` command shall start the workspace's routines when they are due, in the foreground, with the routine scheduler on the local engine's tick, until Ctrl C or SIGTERM. It shall read the workspace as the Studio's routine scheduler does (`LiveRoutines`): on every tick, the routines of the live version, each On or Off as its saved file says, or the saved files with history off. It shall first refuse, with nothing written to the run log, a workspace whose history git can't open (exit 9, as `halonic run` refuses it), a workspace with history but nothing live yet (exit 5, with `halonic run`'s own line), a workspace with an error in a file other than a routine's (exit 2, `cli.workspace-file-problems`), and a workspace that isn't trusted on this computer and whose runs could reach more than the test model (exit 3); and check the sandbox for the workflows the routines start. A routine whose own file has errors, as `halonic validate` finds them, shall be left out on every tick, so it never starts, while the other routines start as usual; the first tick that leaves it out shall print "✕ Friday digest can't start until its file is fixed · halonic validate", with the user's `--dir`, once until its file is fixed, and the tick after the fix shall print "✓ Friday digest can start now" and start it again from then on. When the routine's errors are in the live version and its saved file has none, that line shall instead say "✕ Friday digest can't start until its fix is committed or made live in Halonic Studio", since `halonic validate` reads the saved file and finds nothing. A routine that is on and runs an agent in a harness (Claude Code or Codex), or a workflow with such an agent, shall be left out the same way, read from the live version on every tick, since the watch doesn't start harness agents yet; the first tick that leaves it out shall print "✕ Daily notes can't start: routines can't run agents in Claude Code yet, and Coder is in Claude Code. Set the agent to Halonic's own loop, or turn the routine off.", once until it changes, and "✓ Daily notes can start now" on the tick after it changes; the sandbox isn't checked for it. The trust check counts such an agent as `halonic run` does, since trust is the workspace's. Its first line shall say how many routines are on a clock and how to stop, and when none is because every routine left out above can't start, that the watch starts one on time once it can, so to leave it running: "Watching 0 routines in Acme for now. Once a routine above can start, the watch starts it on time, so leave this running. Stop with Ctrl C."; under it, for each webhook routine that is on, one line shall say that a web request starts it and that `halonic serve` receives it: "Friday digest starts on a web request: run halonic serve for it." For each run it starts, it shall print one finished line with the routine's name, the run's short id and the due time; for a run that didn't start, a ✕ line, with the reason under `--debug`. Each workflow run it starts shall read the live version at the time the routine is due, start with that version's definitions, and record it on its `run.started` (its commit and date, or the saved files with history off). A version made while it watches shall count from the next tick. Before a run starts from a version, that version shall pass the trust check and the sandbox check for the run's workflow, and keep the workspace's local only as the watch started with it; a version that doesn't starts no run, and the run's ✕ line says so under `--debug`. While it watches, the timers of waiting runs shall fire when they are due. When a run's step keeps failing (its timer fails three times), it shall print a ✕ line with the routine's name and the run's short id, with the reason under `--debug`, and keep watching while the engine keeps retrying that step; `halonic run` stops at such a run instead. Once that step has kept failing for an hour, from its first failure in a row, the watch shall give up on the run: it cancels the run, or, when cancelling fails too, stops trying that step until the next watch or run, prints a ✕ line with the routine's name and the run's short id, with the reason and whether the run was cancelled under `--debug`, and keeps watching. Three failed ticks in a row shall stop the watch with the last error, and a tick that works starts that count again. Ctrl C shall stop it with "Stopped." and exit 130, SIGTERM with exit 143, and the engine shall be closed either way.

## Examples

- Given a trusted workspace with Hourly follow-up and a routine Daily notes that runs Writer, whose file says `harness: claude-code`, every minute,
  when `halonic routines watch` is run,
  then it prints "✕ Daily notes can't start: routines can't run agents in Claude Code yet, and Writer is in Claude Code. Set the agent to Halonic's own loop, or turn the routine off." and "Watching 1 routine in Acme. Stop with Ctrl C.", and at 15:00 it starts only Hourly follow-up.
- Given the same workspace without Hourly follow-up,
  when `halonic routines watch` is run,
  then it prints the same ✕ line, then "Watching 0 routines in Acme for now. Once a routine above can start, the watch starts it on time, so leave this running. Stop with Ctrl C.", and starts nothing.
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
- Given a routine Hourly follow-up and a routine Friday digest whose workflow isn't in its hub,
  when `halonic routines watch` is run,
  then it prints "✕ Friday digest can't start until its file is fixed · halonic validate" and "Watching 1 routine in Acme. Stop with Ctrl C.", and at 15:00 it starts Hourly follow-up only.
- Given that watch, when Friday digest's file is fixed,
  then the next tick prints "✓ Friday digest can start now", and from then on Friday digest starts when it is due.
- Given a watch that is running,
  when Ctrl C is pressed,
  then it prints "Stopped." and exits 130; on SIGTERM it exits 143.
- Given a workspace with an Ollama provider that isn't trusted,
  when `halonic routines watch` is run,
  then it stops with "✕ Couldn't watch the routines in acme: Acme isn't trusted on this computer yet. Nothing ran.", exit 3, and the run log stays empty.
- Given a routine that runs Follow up every hour, and a webhook routine Friday digest,
  when `halonic routines watch` is run,
  then it prints "Watching 1 routine in Acme. Stop with Ctrl C." and "Friday digest starts on a web request: run halonic serve for it."
