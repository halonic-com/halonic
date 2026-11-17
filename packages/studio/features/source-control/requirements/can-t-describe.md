# source-control.cant-describe

- Status: active
- Since: unreleased
- Source: HAL-1302 (T9); ux-checklists-t8-t9 (HAL-1360) part 2, "Halonic can't describe this change"; a11y 13.5

When a changed file is not one Halonic can put in words, What changed shall say "Halonic can't describe this change.", then show one CHANGED row for the file, with its name in a monospace font, and Advanced open with the file's lines. Undo these changes shall stay.

## Examples

- Given `notes/todo.txt` changed,
  when the person opens its row,
  then the page says "Halonic can't describe this change.", shows CHANGED and `notes/todo.txt`, and Advanced is open with the lines.
- Given an agent's file changed,
  when the person opens its row,
  then the page does not say "Halonic can't describe this change." and Advanced is closed.
