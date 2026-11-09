# Decision: the CLI texts on `main` follow the approved cli-output

- Requirements: `cli.help`, `cli.help-exit-codes`, `cli.exit-codes`, `cli.print-error`,
  `cli.commands.schema.write-every-kind`
- Task: HAL-2196, after the board approved the CLI words on HAL-2123 (cli-output on HAL-1981)
- Approval: the task asks for these changes; the maintainer approves this note in review

## What changes

- **Unknown command** (cli-output 1.3 and section 6): "✕ There's no command "deploy"." with
  "Run halonic --help to see every command." under it, through `printError`, instead of
  "Unknown command" and the whole help. "Did you mean x?" joins line 1 only when exactly one
  command is within an edit distance of 2. `UsageError` gets an optional `fix`, which `printError`
  prefers over the usage line, so the unknown command uses the one printer.
- **`halonic schema`** (3.9 and 1.2): "✓ Wrote 15 JSON Schemas to ./schemas." with the folder as the
  user would type it, and "halonic schema takes at most one folder, and you gave two: a, b."
- **`halonic --help`** (1.9): the first line "Run and check Halonic workspaces from the command
  line.", `schema`'s summary "Write the JSON Schema of every file kind, for editors", 9 is "didn't
  answer or the sandbox can't start", and the list ends with "130 or 143 stopped". The exit codes
  wrap at 80 columns (revision 15 of cli-output, the same words on four lines) instead of the
  fixed split after 3.

## What stays

- The "Options for every command:" line stays. The task predates HAL-2223, which added it on
  purpose with only the options that exist (`--debug, --help`).
- A bug's "Couldn't <verb> <thing>:" prefix is not in this change: Ravi builds it in the message
  catalogue on HAL-2268, as agreed on HAL-2196. Its `--debug` line already landed in #672.

## Tests

No test was weakened. The help, unknown-command and schema tests check the exact approved strings,
and new tests check the 80-column limit, "Did you mean" and the shown folder.
