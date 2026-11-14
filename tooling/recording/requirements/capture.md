# recording.capture

- Status: active
- Since: 0.1.0
- Source: HAL-6422; the capture step of the README recording's storyboard on HAL-6395 (section 6, step 1)

When the capture runs a recording, the capture shall run each command for real in a new empty home folder, with only the given program folder and the system folders on `PATH`, and shall write what the terminal showed as asciicast v2, with each write at its real time and a marker, labelled with the command, where each command is typed. Before the commands, the capture shall run `halonic --version` once, off camera, in the same kind of clean home folder, and shall save what it printed next to the cast as `<name>.version`.

## Examples

- Given a recording whose commands are `halonic init --example acme` and `cd acme`,
  when the capture runs it,
  then the cast holds a marker "halonic init --example acme", the echoed command line in an output event of its own, and the CLI's output with the times `script` recorded.
- Given a command `halonic runs send {run} approve` whose `set` finds the waiting run,
  when the capture runs it,
  then the marker and the echoed line show the real run id.
- Given a command that exits with an error,
  when the capture reads the log,
  then it stops with an error that names the failure, and writes no cast.
- Given a `halonic` whose `--version` prints "Halonic 0.1.0",
  when the capture runs,
  then it writes `first-run.version` holding "Halonic 0.1.0" next to `first-run.cast`, and the cast's title says "Terminal · Halonic 0.1.0".
- Given a `halonic` without `--version`, as on `main` before PR #1883,
  when the capture runs,
  then it stops before the commands with an error that quotes what `halonic --version` printed, and writes no cast.
