# feedback.payload

- Status: active
- Since: unreleased
- Source: HAL-18563 (board's go-ahead on HAL-10); details from Sofia's sketch on HAL-18562

When the person presses **Send**, the Feedback feature shall make one task for the configured
project and assignee. Its title shall be the first line of the text that holds any text, trimmed,
at most 80 characters with "…" at the end when it is cut. Its description shall hold the whole
text, then the app, the window, the time in ISO 8601 with the computer's offset, the Studio version
and the screenshot's size. The app and window names shall be shown as code, so Markdown in another
app's window title stays plain text. When the text holds nothing but spaces, the feature shall make
no task and shall say "Write a line about what you saw."

## Examples

- Given the text "Run list jumps\nIt scrolls to the top after every update",
  when the person presses **Send** at 18:04:05 in Madrid in winter,
  then the task is titled "Run list jumps" and its description says
  "Time: 2026-11-25T18:04:05+01:00".
- Given a window titled "[click](https://example.com)",
  when the task is made,
  then its description shows the title as code, not as a link.
- Given empty text,
  when the person presses **Send**,
  then no task is made and "Write a line about what you saw." shows.
