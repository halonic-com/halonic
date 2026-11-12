# library.refusal-line

- Status: active
- Since: 0.1.0
- Source: HAL-1063; HAL-998

The Library feature shall turn one refusal into one line of plain text in a single function, `refusalLine`. The line shall name the source, what was refused and, when the refusal has one, the tool's name in straight quotes, then the reason. The status view shall show the line as text only and shall never pass it to the model.

## Examples

- Given a refusal of the tool "look up" from the source "notes" because its name breaks the name rule,
  when it is turned into a line,
  then the line is `notes: left out "look up": its name breaks the name rule`.
- Given a refusal of a whole listing, which has no tool name,
  when it is turned into a line,
  then the line has no quotes.
