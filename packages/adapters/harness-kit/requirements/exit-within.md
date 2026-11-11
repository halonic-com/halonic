# harness-kit.exit-within

- Status: active
- Since: 0.1.0
- Source: HAL-5216; `docs/guides/failure-path.md` rule 1; the approach agreed on HAL-5231

When a harness waits for its program to exit, after the program's output has ended or its input was closed, the harness shall wait at most 10 seconds. When the program hasn't exited by then, the harness shall kill it and end the run with a plain error that names the program.

## Examples

- Given Claude Code that has printed its result and then never exits,
  when 10 seconds pass after its input was closed,
  then Halonic kills it, and the run ends with "Claude Code didn't exit within 10 seconds, so Halonic stopped it."
- Given a program that exits within the time,
  when the harness waits for it,
  then it gets the program's exit and kills nothing.
