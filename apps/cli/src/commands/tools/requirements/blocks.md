# cli.commands.tools.blocks

- Status: active
- Since: 0.1.0
- Source: HAL-2827 (HAL-850 step 5); the words of cli-output 3.10 (revisions 33 and 36) and the UX checklist on HAL-2883, parts B and C; HAL-2579 G1 and G2

The `halonic tools` commands shall show a listed tool that waits for approval as one block: its state (Changed, Not approved or Keeps changing) and its name, then indented its description or, for a Changed tool, only what changed in Studio's plain labels with `before` and `now`, a `!` line for a change a person can't see, its arguments, whether it asks before each use, and its fingerprint in full. A Changed tool whose text is the same shall say that the source connects differently instead. A tool its server keeps changing shall be shown as it is now. Every text the server wrote shall be escaped, so no control or bidi character reaches the terminal.

## Examples

- Given `archive` never approved,
  when its block is shown,
  then it reads "Not approved  archive", its description, "Arguments  id (string): the note's id", "Asks you before each use." and its full fingerprint.
- Given `lookup` approved and its description changed since,
  when its block is shown,
  then it reads "Changed  lookup", "Description", and the description before and now.
- Given a description in which a letter was swapped for one from another alphabet,
  when its block is shown,
  then it has the line "! Looks the same, but a letter was swapped for one from another alphabet.".
- Given `send` approved, and the connector's arguments changed since,
  when its block is shown,
  then it says "Its text hasn't changed, but notes-mcp connects differently…" and has no before or now.
- Given a description with an escape code, a carriage return and U+202E,
  when its block is shown,
  then none of them is in it raw.
