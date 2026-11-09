# app.doctor-harnesses

- Status: active
- Since: 0.1.0
- Source: HAL-2270; HAL-189 implementation plan 6a; P5 on HAL-2264 (the Harnesses line); cli-output 3.7 (a ! line exits 0)

The Harnesses line of `halonic doctor` shall list each harness whose check finds it ready, with its version. While an agent of the workspace uses a harness that isn't installed, the line shall be marked as a warning and name that agent and the harness. While an agent uses a harness that is installed in a version Halonic doesn't support, or whose version Halonic couldn't ask, the line shall be marked as a warning and name the harness once, with the version and the supported range, or with the reason. A harness that no agent uses shall never mark the line. The line shall never be marked as failed. If no harness is ready and no agent uses one, then there shall be no Harnesses line.

## Examples

- Given Claude Code 2.1.0 and Codex 0.9.2 are ready and no agent uses either,
  then the line is ✓ and lists both.
- Given Writer uses Codex and Codex isn't installed,
  then the line is ! with "Writer uses Codex, and it isn't installed."
- Given Writer and Reviewer use Claude Code 0.9.1 and Halonic needs 1.0.0 or newer,
  then the line is ! with one problem for Claude Code, not one per agent.
- Given Claude Code 0.9.1 is installed and no agent uses it,
  then the line isn't marked and Claude Code isn't listed.
- Given no harness is installed and no agent uses one,
  then `doctor` prints no Harnesses line.
