# feedback.send-window

- Status: active
- Since: unreleased
- Source: HAL-18971 (plan on HAL-18919); words and look from Sofia's sketch on HAL-18562, §2; a dialog in the window, not a window of its own, from the board's report on HAL-10 (26 Nov, HAL-19528)

When the shell has kept the crop of the box selected on the overlay, the Feedback feature shall
show the Send feedback dialog inside the window where the shortcut was pressed, and no other window
shall open. The dialog shall show the crop from `plugin:feedback|crop`, fitted inside a box 220
pixels high and never stretched, with its size as "{width} × {height}" under it, the text field
focused with the placeholder "What did you notice? The first line becomes the title.", and the
footnote "Goes to {project} as a task in Paperclip for {assignee}, with the time and Studio
version." When the person presses Send or Ctrl Enter (⌘ ↩) with text, the feature shall hand on
one feedback, with the crop as a PNG of at most 7 MiB, scaled down when it is larger, and once the
feedback is taken close the dialog and call `plugin:feedback|end`. When the text holds nothing but
spaces, the feature shall say "Write a line about what you saw.", focus the field and hand on
nothing. When the person presses Cancel, the ✕ or Esc, the feature shall close the dialog, call
`plugin:feedback|end` and hand on nothing. The states for a crop that can't be loaded and a Send
that isn't taken are in `feedback.send-states`.

## Examples

- Given a box selected in Studio's window,
  when the shell has kept its crop,
  then the Send feedback dialog shows in that window, and no other window opens.
- Given the text "Run list jumps",
  when the person presses Send,
  then one feedback titled "Run list jumps" is handed on with its PNG, and the dialog closes.
- Given a 4K crop whose PNG would be 24 MB,
  when the person presses Send,
  then it is sent scaled down to 7 MiB or less, keeping its shape.
- Given empty text,
  when the person presses Send,
  then "Write a line about what you saw." shows and nothing is sent.
- Given text typed,
  when the person presses Cancel, the ✕ or Esc,
  then the dialog closes and the feature calls `plugin:feedback|end`.
