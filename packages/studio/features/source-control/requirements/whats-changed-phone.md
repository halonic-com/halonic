# source-control.whats-changed-phone

- Status: active
- Since: unreleased
- Source: HAL-1302 (T9); ux-checklists-t8-t9 (HAL-1360) part 2, 2.13 (T9-F8 to F11); design-phone (HAL-552) 5.2, 5.7

When the screen is a phone, the What changed page shall show the item's changes in words only, with no Advanced and no line diff, and **Undo these changes** shall be the page's bottom bar instead of a button in its header. When the window can open items and the item is an agent, a workflow or a routine, the page shall offer "Open *name*" as a 48px row under the changes. When the person presses Undo these changes in the bar, the page shall close as the desktop page does, with the same toast and focus on the row that took its place. When the undo failed and its roll-back failed too, the warning shall be the first thing under Back to Changes, above the item's name. When the item holds a file Halonic can't describe, the page shall say CHANGED, NEW or DELETED with the file's name, and the bar shall keep Undo these changes.

## Examples

- Given a phone and `agents/triage.agent.yaml` changed,
  when the person opens the row "Triage",
  then Undo these changes is in the bottom bar, the header has no Open agent, and the page has "Open Triage" as a row.
- Given a phone and a changed agent,
  when the person opens it,
  then the page has no Advanced and no "Lines 12 to 18".
- Given a phone and a changed file Halonic can't describe,
  when the person opens it,
  then the page says CHANGED with the file's name and keeps Undo these changes.
- Given a phone and the skill "tone" open,
  when the person presses Undo these changes in the bar,
  then the list comes back, the toast says "Undid changes to tone." and focus is on the row that took its place.
