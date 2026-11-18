# source-control.cant-describe

- Status: active
- Since: unreleased
- Source: HAL-1302 (T9); ux-checklists-t8-t9 (HAL-1360) part 2, "Halonic can't describe this change"; a11y 13.5

When a changed file is not one Halonic can put in words, What changed shall say "Halonic can't describe this change.", then show one label for the file, CHANGED, NEW or DELETED, with its name in a monospace font. When the file has changed lines, Advanced shall start open with them; a new or deleted file has no Advanced and shows its text. Undo these changes shall stay.

## Examples

- Given `notes/todo.txt` changed,
  when the person opens its row,
  then the page says "Halonic can't describe this change.", shows CHANGED and `notes/todo.txt`, and Advanced is open with the lines.
- Given `notes/new.txt` is a new file,
  when the person opens its row,
  then the page says "Halonic can't describe this change.", shows NEW and `notes/new.txt`, and has no Advanced.
- Given an agent's file changed,
  when the person opens its row,
  then the page does not say "Halonic can't describe this change." and Advanced is closed.
