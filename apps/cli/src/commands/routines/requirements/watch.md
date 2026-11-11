# cli.commands.routines.watch

- Status: active
- Since: 0.1.0
- Source: HAL-4844, HAL-187 item 7; Ctrl C and SIGTERM from cli-output 1.5 (HAL-2022); the trust check of cli-output 3.4. cli-output has no section for `routines`; the words are team wording built on the `halonic run` lines, as HAL-2282 allows

The `halonic routines watch` command shall start the workspace's routines when they are due, in the foreground, with the routine scheduler on the local engine's tick, until Ctrl C or SIGTERM. It shall first refuse a workspace that isn't trusted on this computer and whose runs could reach more than the test model, with exit 3 and nothing written to the run log, and check the sandbox for the workflows the routines start. Its first line shall say how many routines are on a clock and how to stop. For each run it starts, it shall print one finished line with the routine's name, the run's short id and the due time; for a run that didn't start, a ✕ line, with the reason under `--debug`. While it watches, the timers of waiting runs shall fire when they are due. When a run's step keeps failing (its timer fails three times), it shall print a ✕ line with the routine's name and the run's short id, with the reason under `--debug`, and keep watching while the engine keeps retrying that step; `halonic run` stops at such a run instead. Three failed ticks in a row shall stop the watch with the last error, and a tick that works starts that count again. Ctrl C shall stop it with "Stopped." and exit 130, SIGTERM with exit 143, and the engine shall be closed either way.

## Examples

- Given a routine that runs Follow up every hour, at 14:01,
  when `halonic routines watch` is run,
  then it prints "Watching 1 routine in acme. Stop with Ctrl C.".
- Given that watch, when the clock passes 15:00,
  then it starts the run due at 15:00 and prints "✓ Started Hourly follow-up · run <id> · due 15:00".
- Given that run waits at a step that moves on after 5 minutes,
  when the clock passes the timer's due time,
  then the timer fires and the run finishes.
- Given a run of Hourly follow-up whose step failed three times,
  then the watch prints "✕ Hourly follow-up got stuck · run <id> · see why with --debug" and keeps watching.
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
