# workspace.trust-check-escaped

- Status: active
- Since: unreleased
- Source: HAL-16323: Studio's trust check shows outside text safely; HAL-16420 (C706 row 1): written out as markers, as the plugin trust check and the Inbox do (mockup-trust section 5, "Hidden characters as visible tokens")

When the trust check shows text that comes from the workspace, such as a row's name, its detail, a line's label or value, a warning, the title, the source line or a summary, it shall show each hidden character (a control character, a zero-width character, a bidi control, a tag character), and each tab and newline, as a marker such as `⟦U+202E⟧`, in amber, so the text reads in the order it runs and nothing in it stays hidden. Other text, emoji and accents included, shall be shown as it is.

## Examples

- Given a program row whose command holds the bidi control U+202E,
  when the person opens the check,
  then the row's detail shows `⟦U+202E⟧` in its place, in amber.
- Given a line whose value holds an escape character,
  when the person opens the check,
  then the line shows `⟦U+001B⟧` in its place.
- Given an env entry `GREETING=hi` and `there` with a zero-width space between them,
  when the person opens the check,
  then the line reads `GREETING=hi⟦U+200B⟧there`.
