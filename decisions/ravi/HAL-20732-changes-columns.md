# Decision: Changes shows its list column beside a content pane, and What changed opens in the pane

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-20732 (P5 of the HAL-20617 build plan, approved by Liam on the task). Liam approves the change in review on HAL-20732.
- Kind: user-visible
- Task: HAL-20732

## What changes

New requirement `source-control.list-column`: on the desktop the Changes page is a list column of the kit's list-column size (`kit.list-column`), with the heading, sharing, changed items and History, beside a content pane. The pane shows the open item's What changed, or Get updates' choices while the person picks them. With nothing open it shows the Changes place icon, "Changes" and how many items changed ("3 changes"), or "Nothing has changed since your last version.". These are words the page already uses. A phone keeps one column.

`source-control.whats-changed-page`: on the desktop, opening a row shows What changed in the content pane instead of in place of the list. The list stays beside it and the open row is marked as the current one (`aria-current`). The item's name is the pane's `h2` under the page's one `h1`, "Changes", and focus goes to it. The pane has no Back to Changes, because the list is still beside it. A file's path, its groups and Advanced's line headings each move one level down, so no heading level is skipped. What changed still opens as its own page, with Back to Changes and the item's name as the only `h1`, where it has no pane: on a phone drawn without the window's page stack. The rest of the requirement is unchanged: Undo these changes, Open, focus on the row that took the place of an undone item, new items' fields, the roll-back.

Tests changed to follow:
- `whats-changed-page.test.tsx`: "opens in place of the list…" now runs on a phone, where What changed is still its own page. A new desktop test checks the pane's `h2`, the list beside it, the one `h1` and that there is no Back to Changes. "puts focus on the row it came from when the person presses Back to Changes" runs on a phone, where that button still exists. The heading-order tests expect the levels one lower under the pane's `h2` ([2, 3, 3], line headings `h3`, or `h4` under a path). They still check that no level is skipped, counting from the list's `h1`.
- `change-list.test.tsx`: "Important" is found as an `h3` under the pane's `h2`; "opens an item with Enter" finds the item's name in the pane.
- `test-support/open-item.ts` finds an open item by the pane's `h2` as well as a page's `h1`.

New tests in `changes-columns.test.tsx` cover `source-control.list-column`: the list column's size, the empty pane's words, opening rows in the pane with the current row marked, the pane emptying with focus on the next row after Undo these changes, Get updates' choices in the pane, and a phone with no pane. No test was skipped or weakened: every changed test checks the same behaviour in the new layout, or on the phone where the old layout remains.

## Why

The board picked the WhatsApp two-column layout (HAL-20617). The build plan's P5 moves each screen onto it, and Library (`library.list-column`), Inbox and Runs already have it. What changed is the natural content of the Changes pane. As its own page it hid the list, so a person had to go back to the list for each item. The diff view itself waits for Noah's and Sofia's designs, so it keeps its look and is only placed in the pane.

## Covers

- source-control.list-column
- source-control.whats-changed-page
