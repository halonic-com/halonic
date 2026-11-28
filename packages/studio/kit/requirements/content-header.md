# kit.content-header

- Status: active
- Since: unreleased
- Source: the Inbox and Messenger layout approved by the board on HAL-19192 (26 Nov), Sofia's sketches of 09:08 there: one header for an open chat and an open Inbox item; built on HAL-19492

The kit's `ContentHeader` shall show its picture, then its title as a level-2 heading cut with an ellipsis over an optional muted line, then its actions at the end, 16px apart (12px while the layout is the phone's), in a 64px-tall bar over a soft shadow (the new design's chat header, HAL-20728). In light it shall have no line under it; in dark, where the shadow doesn't show, a 1px line in the old divider's colour (`#1B2638`); under More contrast, the 3:1 `border-control` line (HAL-20776).

## Examples

- Given the title "Chief", the line "Paperclip · Acme" and a Find button,
  when the header renders,
  then it shows the picture, the heading "Chief" over "Paperclip · Acme", and the Find button last.
- Given no line,
  when the header renders,
  then only the heading shows beside the picture.
