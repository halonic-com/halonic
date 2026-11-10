# cli.stop

- Status: active
- Since: 0.1.0
- Source: HAL-2184; the CLI output design on HAL-1981 (cli-output sections 1.5 and 2, and the checklist item "Progress" in section 5), approved by the board on HAL-2123

While a `halonic` command runs, the first Ctrl C or SIGTERM shall ask the command to stop cleanly, and the command shall end with "Stopped." and what stopping meant, and exit with 130 for Ctrl C or 143 for SIGTERM. The stop line shall go to stderr, after the live line is cleared. With `--json`, stderr shall stay empty and stdout shall hold the command's one document, with `"ok": false`. A second Ctrl C or SIGTERM shall end the command at once, without waiting for it to stop: it shall clear the live line, print only "Stopped." and exit with that second signal's code.

## Examples

- Given a command running in a terminal,
  when the user presses Ctrl C,
  then the command is asked to stop and it ends with code 130.
- Given a command a CI job runs,
  when the job is cancelled and SIGTERM arrives,
  then it ends with code 143.
- Given a command that is already stopping after Ctrl C,
  when Ctrl C comes again,
  then it ends at once with code 130.
- Given a command that is already stopping after Ctrl C,
  when SIGTERM comes,
  then it prints only "Stopped." and ends at once with code 143.
- Given `halonic run support-reply --json`,
  when Ctrl C stops it,
  then stderr stays empty and stdout holds one JSON document with `"ok": false`.
- Given a run cancelled after the step Classify,
  when its stop line is made,
  then it reads "Stopped. The run 01JD8Q was cancelled after the step Classify. Nothing after it ran."
