# source-control.whats-changed-page

- Status: active
- Since: unreleased
- Source: HAL-1302 (T9); ux-checklists-t8-t9 (HAL-1360) part 2, 2.4 header; a11y 13.5; HAL-12857 (a new item's fields)

When the person opens a row of the Changes list, the Studio shall show What changed as its own page in the same tab, in place of the list: Back to Changes, the item's name as the page's only `h1`, **Undo these changes** for every file of the item, and Open workflow (or Open agent, Open routine) for an item of that kind when the window can open items. Focus shall start on the `h1`. Back to Changes shall return to the list with focus on the row the page was opened from; when the item has no changes left, as after Undo these changes, the list shall come back with focus on the row that took its place, or on the page's heading when no item is left. Under the `h1` a file's path, when it is shown, shall be an `h2` and its groups and parts one level below it; with no path shown the groups and the parts of Advanced, "Line 3", shall be `h2`s, so no heading level is skipped. A new item whose file reads as its kind shall show "New <kind>" ("New skill") and each field it sets with the label an edited item's change uses (`newItemFields`), and its whole file only under Advanced, closed at first; other new files keep their first lines and their one line. When one file of the item can't go back, the files already put back shall be put the way they were, so the item is left as it was, no toast shall be shown, and the page shall say why.

## Examples

- Given `agents/triage.agent.yaml` changed,
  when the person opens the row "triage",
  then the page says "triage" as its `h1`, offers "Open agent", and the list is not shown.
- Given the person opened "triage" from the list,
  when they press Back to Changes,
  then the list is shown again with focus on the row "triage".
- Given an item with two changed files,
  when the person presses Undo these changes,
  then both files go back as the last version has them, with one toast whose Undo puts both back.
- Given an item with two changed files and the second was edited elsewhere after the page read it,
  when the person presses Undo these changes,
  then the first file is as it was before the press, there is no toast, and the page says the file changed while they were looking.
- Given a new skill "Refund handling",
  when the person opens its row,
  then the page shows "New skill", "Name: Refund handling", "When to use it" and "Instructions" with their values, no `---` header, and the file itself under Advanced.
