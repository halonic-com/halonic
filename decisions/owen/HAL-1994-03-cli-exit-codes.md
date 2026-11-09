# Decision: exit codes 4 to 9 for the error kinds

- Requirement: `cli.exit-codes` (`apps/cli/requirements/exit-codes.md`)
- Task: HAL-1994, decided by the maintainer on HAL-1984
- Approval: the task asks for this change to `requirements/exit-codes.md`; the maintainer approves this note in review

## What changes

`cli.exit-codes` adds the codes 4 to 9, one per error kind (`not_found`, `conflict`,
`unauthenticated`, `denied`, `limit_reached`, `unavailable`), and says that `internal` exits with 1
and `invalid_input` with 2. Codes 0 to 3 keep their meaning; nothing the requirement promised is
taken away. The error-kind plan on HAL-1663 had numbered the kinds from 3, which clashed with 3 =
not trusted on `main`, so the kinds moved, not `main`.

## Tests

No test was weakened. The test that pins every code now lists 4 to 9 as well, and the `--help`
test expects the two exit code lines after the commands (new requirement `cli.help-exit-codes`).
