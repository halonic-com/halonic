# app.doctor-summary

- Status: active
- Since: 0.1.0
- Source: HAL-2270; cli-output 3.7 and microcopy L94 (the summary); Liam on HAL-1984 (the exit code)

The summary of `halonic doctor` shall count the lines marked as failed as problems and the lines marked as a warning as warnings. While any line is marked as failed, `doctor` shall report that something needs fixing, so the command exits 1. A line marked as a warning shall never make it report that, so the command exits 0.

## Examples

- Given every line is ✓,
  then there are no problems or warnings, and nothing needs fixing.
- Given the Sandbox line is ✕ and the Models line is !,
  then there is 1 problem and 1 warning, and something needs fixing.
- Given the Models and Harnesses lines are !,
  then there are 2 warnings, and nothing needs fixing.
