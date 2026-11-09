# Decision: three small follow-ups to the CLI texts from the #712 review

- Requirements: `cli.exit-codes`, `cli.commands.schema.write-every-kind`
- Task: HAL-2472, the follow-ups Liam asked for in his review of #712 (HAL-2465)
- Approval: the task asks for these changes; the maintainer approves this note in review

## What changes

- **`cli.exit-codes`**: the main paragraph said a wrong command line prints the command's usage
  line. Since #712 an unknown command prints the pointer to `halonic --help` instead. The paragraph
  now says the fix follows `cli.print-error`, matching `cli.help` and `cli.print-error`. The CLI's
  behaviour doesn't change.
- **`cli.commands.schema.write-every-kind`**: the shown folder uses the system's separator, so
  `.\schemas` on Windows, which is what a Windows user types. The requirement now says so. When
  `halonic schema` refuses more than one folder, a name that is empty or holds a space or a comma is
  shown in double quotes, so `halonic schema "" b` prints `you gave two: "", b.` instead of
  `you gave two: , b.`.

## What stays

The approved words in cli-output (HAL-1981) don't change. On Linux and macOS users read exactly
what they read before; on Windows the path form is the system's, as it already was.

## Tests

No test was weakened. The golden test for `halonic schema` now turns the system's separator into
`/` before it compares, so it passes on Windows as well as on Ubuntu. A new test checks the quoted
names.
