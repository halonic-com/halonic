# harness-kit.exit-within

- Status: active
- Since: unreleased
- Source: HAL-5216; `docs/guides/failure-path.md` rule 1; the approach agreed on HAL-5231; keeping a result after the stop from HAL-15968

When a harness waits for its program to exit, after the program's output has ended or its input was closed, the harness shall wait at most 10 seconds. When the program hasn't exited by then, the harness shall kill it. When the program had already given its result, the harness shall keep that result, record that it stopped the program as `harness.stopped` (`events.harness-stopped`), and let the run continue; otherwise it shall end the run with a plain error that names the program. When killing the program fails, the run shall end with an error, since the program may still be running.

## Examples

- Given Claude Code that has printed its result and then never exits,
  when 10 seconds pass after its input was closed,
  then Halonic kills it, the stream has `harness.stopped` with `reason` `no-exit-after-result` and `afterMs` 10000, and then the agent's `agent.finished` with the result.
- Given Claude Code whose output ended before its result and that never exits,
  when 10 seconds pass,
  then Halonic kills it, and the run ends with "Claude Code didn't exit within 10 seconds, so Halonic stopped it."
- Given a program that exits within the time,
  when the harness waits for it,
  then it gets the program's exit and kills nothing.
- Given a program that doesn't exit in time and can't be killed,
  when the harness waits for it,
  then the wait ends with the kill's error.
