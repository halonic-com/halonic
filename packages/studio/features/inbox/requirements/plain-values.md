# inbox.plain-values

- Status: active
- Since: 0.1.0
- Source: HAL-1218, rule 3 of Liam's wait-step decision ([HAL-2560](/HAL/issues/HAL-2560)); [card requirements](/HAL/issues/HAL-64#document-requirements) INBOX-CARD-27 and 28; [ux-checklists-approvals](/HAL/issues/HAL-1250#document-ux-checklists-approvals) 2.1

The Inbox shall show a value from a run (a tool call's argument, a wait step's filled-in body) as plain text, because it is model output: no Markdown, no HTML. Every hidden or direction-changing character shall show as a marker such as `⟦U+202E⟧`, and the value then carries the line "Contains hidden or direction-changing characters". That covers direction marks (U+200E, U+200F, U+061C), direction overrides and isolates (U+202A–202E, U+2066–2069), zero-width characters (U+200B–200D, U+2060, U+FEFF), invisible operators (U+2061–2064), the soft hyphen (U+00AD), tag characters (U+E0000–E007F) and control characters other than newline and tab (U+0000–001F, U+007F–009F). A Windows line end counts as a newline. **Show raw JSON** writes the same characters as `\uXXXX` escapes, which is the same JSON.

A long value shall be folded and say how much is hidden: "Show 38 more lines", or "Show 1,200 more characters" when one long line is cut, with the size added from 100 KB on ("Show 38 more lines (1.0 MB)"). A run of more than 3 empty lines shall become one line `⟦40 empty lines⟧`. Nothing is cut sideways.

## Examples

- Given a `title` of "Refund" U+202E "for Sam",
  when the card shows it,
  then it reads `Refund⟦U+202E⟧for Sam` and has the hidden-characters line.
- Given a `context.reply` of `[click](https://example.com) ![x](https://example.com/x.png) <script>alert(1)</script>`,
  when the card shows it,
  then the text is exactly that, with no marker and no hidden-characters line.
- Given a body of 44 lines,
  when the card folds it at 6,
  then 6 lines show and the button reads "Show 38 more lines".
- Given 40 empty lines between two lines of text,
  when the card shows them,
  then they read as one line `⟦40 empty lines⟧`.
