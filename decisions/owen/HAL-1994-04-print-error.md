# Decision: errors print through printError, with the exit code of their kind

- Requirement: `cli.exit-codes` (`apps/cli/requirements/exit-codes.md`)
- Task: HAL-1994, decided by the maintainer on HAL-1984; the failure path of HAL-1663
- Approval: the task asks for `printError` as the only printer; the maintainer approves this note in review

## What changes

`cli.exit-codes` said a failure prints the error's message after `Error:`. It now points to the new
`cli.print-error`, which prints the F16 shape: ✕ and the message, then the error's `fix`. Two
examples change with it:

- The usage error example now shows the ✕ mark and the indented usage line. It still prints the
  problem and the usage line and exits with 2.
- "fails with `disk full`, prints `Error: disk full`" goes. An error without a kind is a bug, and
  the failure path (HAL-1663, `docs/guides/failure-path.md`) says its raw text never reaches the
  user. The example now says it exits with 1, and a new one says a `not_found` error exits with 4.

## Tests

No test was weakened. The tests behind the changed examples now check the new lines in full, and
the "no kind" tests check that the error's own text is not printed. `exitCodeFor` has a test per kind.
