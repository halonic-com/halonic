# cli.run

- Status: active
- Since: 0.1.0
- Source: HAL-4356 for a run Ctrl C couldn't cancel; HAL-3814 (plan for `halonic run`, PR D, approved by Liam on HAL-3895, and his review of #1243 on HAL-4026 for a stuck run); the command's shape from HAL-2000; cli-output 3.4 (HAL-1981), and HAL-1984 for a run that reaches only the test model

The command `halonic run <workflow> [--dir <folder>] [--input <file or JSON>] [--event <event>]...` shall start the workflow in the workspace, named by its id or as `hub/workflow`, in the engine on this computer (`cli.local-engine`), and follow the run until it ends or waits. Before it starts anything, it shall refuse a workspace that isn't trusted on this computer, or changed since it was trusted, with the trust check and exit code 3, unless every provider file is `mock` and the workspace has no connector and no harness agent. `--input` shall be a JSON object, as a file relative to the current folder or as the JSON itself; anything else shall be `invalid_input`. Each time the run waits for the user, the command shall send the next `--event`, in the order given, through the same service `runs send` uses, and follow the run on; an event the wait doesn't take shall be refused with `runs send`'s words.

It shall print the heading, the step lines, then a finished run's ✓ line, receipt and run log command, a waiting run's two waiting lines, or a failed run's two lines (`cli.run-failure`). It shall exit 0 for a finished or waiting run and 1 for a failed one. Ctrl C or SIGTERM shall stop following the run and say after which step it was cancelled, or only "Stopped." when no step had finished. When the run couldn't be cancelled, it shall say instead that the run wasn't cancelled and may go on, with the `runs show` command to see it, whatever step it was at. When the same timer of the engine fails three times, the command shall stop following the run and fail with that error, so a stuck run isn't silent; fewer failures shall be left to the scheduler's retries.

## Examples

- Given the Acme example and Sam's email,
  when `halonic run support-reply --input examples/refund-question.json` runs,
  then it prints the three steps it ran and "! Waiting for you: Approve this reply?", and exits 0.
- Given the same command with `--event approve`,
  when it runs,
  then it ends with "✓ Support reply finished in …", "Sent nothing · asked you once" and "Run log: halonic runs show <run-id>".
- Given `--event aprove`,
  when the run waits at Approve this reply?,
  then it says "Couldn't send aprove to run <run-id>: the step Approve this reply? takes approve or reject." and "Did you mean approve?", and exits 2.
- Given a workspace with an Ollama provider that isn't trusted on this computer,
  when the command runs,
  then it says "Acme isn't trusted on this computer yet. Nothing ran.", exits 3 and stores no run.
- Given a Ctrl C after the step Classify it,
  when the command stops,
  then it says "The run <run-id> was cancelled after the step Classify it. Nothing after it ran."
- Given a Ctrl C after the step Classify it, with an engine that can't cancel the run,
  when the command stops,
  then it says "The run <run-id> wasn't cancelled, only no longer followed, so it may go on. See where it is: halonic runs show <run-id>".
