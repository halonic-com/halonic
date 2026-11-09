# cli.exit-codes

- Status: active
- Since: 0.1.0
- Source: HAL-187; plan phase 2 (exit code 3 from the trust gate, v1.5); HAL-1994 (codes 4 to 9 for the error kinds, decided on HAL-1984); the wrong command line's fix aligned with `cli.print-error` on HAL-2472

The `halonic` command shall exit with 0 when it worked, 1 when it ran and found errors or failed, 2 when the command line was wrong, 3 when the workspace isn't trusted, and for the error kinds 4 for `not_found`, 5 for `conflict`, 6 for `unauthenticated`, 7 for `denied`, 8 for `limit_reached` and 9 for `unavailable`. An `internal` error shall exit with 1 and an `invalid_input` error with 2. A code shall never change meaning once released. On a wrong command line it shall print the problem and its fix as `cli.print-error` says: the pointer to `halonic --help` for an unknown command, as `cli.help` says, and otherwise the command's usage line; on a failure it shall print the error as `cli.print-error` says.

## Examples

- Given `halonic schema a b`,
  when it runs,
  then it prints "✕ halonic schema takes at most one folder, and you gave two: a, b." and, indented by two spaces, "Usage: halonic schema [outDir]", and exits with 2.
- Given `halonic schema --colour`,
  when it runs,
  then it names the unknown option and exits with 2.
- Given a command that fails with an error that has no kind,
  when it runs,
  then it exits with 1.
- Given a command that fails with a `not_found` error,
  when it runs,
  then it exits with 4.
