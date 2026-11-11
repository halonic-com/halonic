# harness-kit.own-sandbox

- Status: active
- Since: 0.1.0
- Source: review follow-up on HAL-5216 (finding 700), approach agreed on HAL-5231, system checks on HAL-5354

The harness kit shall tell a harness whether its program's own sandbox works on this computer, for runs outside Halonic's fence: yes on macOS, no on Windows, and on Linux only when `bwrap` starts a program in a new network namespace and every other program the harness names is found and runs. It shall check again for each run.

## Examples

- Given macOS,
  when a harness asks,
  then the answer is yes and no program is asked.
- Given Windows,
  when a harness asks,
  then the answer is no.
- Given Linux without `bwrap`, or with one that refuses,
  when a harness asks,
  then the answer is no.
- Given Linux with a working `bwrap`, and `socat` named but missing,
  when Claude Code's harness asks,
  then the answer is no.
