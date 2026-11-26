# messenger.plain-text-notes

- Status: active
- Since: unreleased
- Source: Julian's condition on HAL-19236 (point 3: the front bot's progress notes are shown as plain text, never Markdown or HTML); task HAL-19714

When its source marks a message `plainText`, such as a front bot progress note, the Messenger shall show its body exactly as written: no part of it shall become bold, a link, code or any other markup.

## Examples

- Given Chief's automatic note `**x** <b>y</b> [z](javascript:1)` marked `plainText`,
  when the person opens Chief's chat,
  then the note's bubble reads exactly `**x** <b>y</b> [z](javascript:1)` and holds no bold text and no link.
