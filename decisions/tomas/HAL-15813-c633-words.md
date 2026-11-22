# Decision: C633 words for a connector's stopped program and a for-each item's run that waited

- Approval: Liam approves this change on HAL-15813 (https://paperclip.halonic.com/HAL/issues/HAL-15813), from words check C633 on HAL-15802. These are wording fixes on approved screens and in command output, so the team decides them (HAL-2282 rule).
- Kind: user-visible

## What changes

Two active requirements change their words; nothing else in them changes.

- `library.listed-tools-waiting` (C633 row 24): a connector's page says "Couldn't list the tools:
  notes-mcp's program `sh` stopped right after it started. To see why, run the command and args
  from `library/connectors/notes-mcp.connector.yaml` yourself:" in place of "the program `sh` of
  notes-mcp stopped …". The rest of the line, the file it names and the line to run under it are
  as C634 #5 (HAL-15809) made them, which landed on `main` after C633 asked for "its connector file
  in a terminal" and answers the same question. The buttons stay: **Try again**, no **Copy
  details**.
- `cli.run-failed-item-waits` (C633 row 58): line 2 ends "To see which step it is, run halonic
  validate --dir ./acme." in place of "halonic validate --dir ./acme names it."

## Tests

No test is removed or weakened. The tests of both requirements check the new words.

## Why

"the program `sh` of notes-mcp" matched neither the CLI's "its program sh" nor this page's own
"notes-mcp needs the program `npx`". Where to run it is now said by the line to run that C634 #5
puts under it. "names it" could be read as naming the workflow, and a command is the next step,
so line 2 says it as one.

## Covers

- library.listed-tools-waiting
- cli.run-failed-item-waits
