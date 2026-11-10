# cli.stop

- Status: active
- Since: 0.1.0
- Source: HAL-2184; the CLI output design on HAL-1981 (cli-output sections 1.5 and 2, and the checklist item "Progress" in section 5), approved by the board on HAL-2123

While a `halonic` command runs, the first Ctrl C or SIGTERM shall ask the command to stop cleanly, and the command shall end with "Stopped." and what stopping meant, and exit with 130 for Ctrl C or 143 for SIGTERM. A second Ctrl C or SIGTERM shall end the command at once with the same code, without waiting for it to stop.

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
- Given a run cancelled after the step Classify,
  when its stop line is made,
  then it reads "Stopped. The run 01JD8Q was cancelled after the step Classify. Nothing after it ran."
