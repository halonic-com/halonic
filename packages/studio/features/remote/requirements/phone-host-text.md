# remote.phone-host-text

- Status: draft
- Since: unreleased
- Source: HAL-15180 (D7 design on HAL-15159, section 5 item 10, findings M1 and M3)

The phone shall show the text the computer sends (session titles, approval summaries, row lines and messages) as plain text, and shall not make a link of any of it. It shall show each Unicode bidi control (U+202A to U+202E, U+2066 to U+2069) and every other hidden or control character in that text as a visible marker such as `⟦U+202E⟧`, keeping only the line breaks of a message. It shall show at most 120 characters of a session's title and at most 400 of an approval's summary or a row line, followed by "…" when the computer sent more.

## Examples

- Given an approval whose summary holds a right-to-left override,
  when the Agents list shows it next to Approve,
  then the override shows as `⟦U+202E⟧` and doesn't reorder the text around it.
- Given an approval summary of 500 characters,
  when the Agents list shows it,
  then its first 400 characters show, followed by "…".
- Given an agent message with a URL, an `<a>` tag and a markdown link,
  when the run detail shows it,
  then all three show as text and none opens anything.
