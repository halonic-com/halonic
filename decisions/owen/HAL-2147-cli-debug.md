# Decision: --debug shows a bug's own text, and the bug's fix line says so

- Requirement: `cli.print-error` (`apps/cli/requirements/print-error.md`)
- Task: HAL-2147, the follow-up Liam asked for in his review of #647 on HAL-2142
- Approval: the task asks for this change; the maintainer approves this note in review

## What changes

Since #647, an error without a kind prints only the two generic lines, and its own text is shown
nowhere, so a bug can't be diagnosed from the command line. `cli.print-error` now says:

- A global `--debug` makes the CLI print, after the ✕ lines and for every kind, the error's own
  stack (or its text when it has none) and each error of its `cause` chain after "Caused by:".
- Line 2 of a bug becomes the full F16 step from the CLI output draft (HAL-1981 cli-output,
  section 1.3 rule 5, pending board approval on HAL-2123), as written there: "Run it again with
  --debug to see the details, and report it: https://github.com/halonic-com/halonic/issues". The
  bug example changes with it, and two examples for `--debug` are added.

Without `--debug` nothing else changes: a bug's own text still never reaches the output.

## Tests

No test was weakened. The bug tests check the new line 2 in full; new tests check `--debug` before
and after the command, the cause chain, a value without a stack and a cause that loops.
