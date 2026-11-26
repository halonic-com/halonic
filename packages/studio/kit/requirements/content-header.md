# kit.content-header

- Status: active
- Since: unreleased
- Source: the Inbox and Messenger layout approved by the board on HAL-19192 (26 Nov), Sofia's sketches of 09:08 there: one header for an open chat and an open Inbox item; built on HAL-19492

The kit's `ContentHeader` shall show its picture, then its title as a level-2 heading cut with an ellipsis over an optional muted line, then its actions at the end, above a 1px line.

## Examples

- Given the title "Chief", the line "Paperclip · Acme" and a Find button,
  when the header renders,
  then it shows the picture, the heading "Chief" over "Paperclip · Acme", and the Find button last.
- Given no line,
  when the header renders,
  then only the heading shows beside the picture.
