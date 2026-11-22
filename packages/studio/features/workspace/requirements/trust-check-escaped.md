# workspace.trust-check-escaped

- Status: active
- Since: unreleased
- Source: HAL-16323: Studio's trust check shows outside text as the CLI does (cli-output section 5, "Outside text is escaped", `@halonicjs/words`' `printable`)

When the trust check shows text that comes from the workspace, such as a row's name, its detail, a line's label or value, a warning, the title, the source line or a summary, it shall show each control character and each bidi control as its visible `\u` code, so the text reads in the order it runs. Other text, emoji and accents included, shall be shown as it is.

## Examples

- Given a program row whose command holds the bidi control U+202E,
  when the person opens the check,
  then the row's detail shows `\u202e` in its place.
- Given a line whose value holds an escape character,
  when the person opens the check,
  then the line shows `\u001b` in its place.
