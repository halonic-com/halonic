# std.hidden-characters

- Status: active
- Since: 0.1.0
- Source: moved from the Inbox's plain values (`inbox.plain-values`, INBOX-CARD-28) so the run page's run log view escapes the same characters (HAL-1301)

The std package shall tell which characters a text can carry without anyone seeing them: control characters other than tab and newline (U+0000–0008, U+000B–001F, U+007F–009F), the soft hyphen (U+00AD), the Arabic letter mark (U+061C), zero-width characters and direction marks (U+200B–200F), direction overrides and isolates (U+202A–202E, U+2066–2069), the word joiner and invisible operators (U+2060–2064), the byte order mark (U+FEFF) and tag characters (U+E0000–E007F). When it escapes JSON text, it shall write each of them as `\uXXXX` escapes, two for a character above U+FFFF, so the text stays the same JSON.

## Examples

- Given the JSON string `"Refund<U+202E>for Sam"`, when it is escaped, then it reads `"Refund\u202efor Sam"` and parses back to the same value.
- Given a tag character, when it is escaped, then it reads as its two UTF-16 escapes.
- Given a tab, a newline or a letter, when it is checked, then it isn't hidden.
