# feedback.send-window

- Status: active
- Since: unreleased
- Source: HAL-18971 (plan on HAL-18919); words and look from Sofia's sketch on HAL-18562, §2

When the Send feedback window opens, the Feedback feature shall show the crop from
`plugin:feedback|crop`, fitted inside a box 220 pixels high and never stretched, with its size as
"{width} × {height}" under it, the text field focused with the placeholder "What did you notice?
The first line becomes the title.", and the footnote "Goes to {project} as a task in Paperclip for
{assignee}, with the time and Studio version." When the person presses Send or Ctrl Enter (⌘ ↩)
with text, the feature shall hand on one feedback, with the crop as a PNG of at most 7 MiB, scaled
down when it is larger, and then call `plugin:feedback|end`. When the text holds nothing but
spaces, the feature shall say "Write a line about what you saw.", focus the field and hand on
nothing. When the person presses Cancel or Esc, or the crop is gone, the feature shall call
`plugin:feedback|end` and hand on nothing.

## Examples

- Given the text "Run list jumps",
  when the person presses Send,
  then one feedback titled "Run list jumps" is handed on with its PNG, and the window ends.
- Given a 4K crop whose PNG would be 24 MB,
  when the person presses Send,
  then it is sent scaled down to 7 MiB or less, keeping its shape.
- Given empty text,
  when the person presses Send,
  then "Write a line about what you saw." shows and nothing is sent.
- Given text typed,
  when the person presses Esc,
  then the feature calls `plugin:feedback|end`.
