# library.refusal-line

- Status: active
- Since: unreleased
- Source: HAL-1063; HAL-998; HAL-12413 (UX check C4)

The Library feature shall turn one refusal into one line in a single function, `refusalLine`, as parts of plain text. A refused tool, listing or keyword shall name the source, what was refused and, when the refusal has one, the tool's name in straight quotes, then the reason. A refused call shall be one sentence: the source, "refused a call to", the tool's name as its own part set in code type, then the reason with one full stop at the end. The status view shall show each part as text only and shall never pass the line to the model.

## Examples

- Given a refusal of the tool "look up" from the source "notes" because its name breaks the name rule,
  when it is turned into a line,
  then the line is `notes: left out "look up": its name breaks the name rule`.
- Given a refusal of a whole listing, which has no tool name,
  when it is turned into a line,
  then the line has no quotes.
- Given a refused call to `create_note` from the source "notes-mcp" because the folder is read-only,
  when it is turned into a line,
  then the line reads `notes-mcp refused a call to create_note: the folder is read-only.`, with `create_note` in code type.
