# Decision: Changes shows its list column beside a content pane, and What changed opens in the pane

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-20732 (P5 of the HAL-20617 build plan, approved by Liam on the task). Liam approves the change in review on HAL-20732.
- Kind: user-visible
- Task: HAL-20732

## What changes

New requirement `source-control.list-column`: on the desktop the Changes page is a list column of the kit's list-column size (`kit.list-column`), with the heading, sharing, changed items and History, beside a content pane. The pane shows one thing at a time, and the list marks its row as the current one (`aria-current`): the open item's What changed, a version picked in History, or Get updates' choices while the person picks them. Opening a row or a version while the choices show puts them aside with the merge still started, as a phone's Back does, and the list's Continue brings them back. With nothing open, the pane shows the Changes place icon and "Changes", with "3 items" (the list's own count words) or "Nothing has changed since your last version." for a repository it read, and "Changes" alone otherwise. When the open item goes, focus moves to the next row or the heading only if it fell to the page with What changed; focus the person put elsewhere stays. A phone keeps one column.

`source-control.whats-changed-page`: on the desktop, opening a row shows What changed in the content pane instead of in place of the list. The list stays beside it. The item's name is the pane's `h2` under the page's one `h1`, "Changes", and focus goes to it. The pane has no Back to Changes, because the list is still beside it. A file's path, its groups and Advanced's line headings each move one level down, so no heading level is skipped. What changed still opens as its own page, with Back to Changes and the item's name as the only `h1`, where it has no pane: on a phone drawn without the window's page stack. The rest of the requirement is unchanged: Undo these changes, Open, focus on the row that took the place of an undone item, new items' fields, the roll-back.

`source-control.history-page` keeps its words: a picked version still shows "beside the list", now in the content pane rather than in a second column inside History, which the list column has no room for. Its name there is an `h2` under the page's `h1` (it was an `h3` under History's `h2`), and What's in it an `h3`.

Tests changed to follow:
- `whats-changed-page.test.tsx`: "opens in place of the list…" now runs on a phone, where What changed is still its own page. A new desktop test checks the pane's `h2`, the list beside it, the one `h1` and that there is no Back to Changes. "puts focus on the row it came from when the person presses Back to Changes" runs on a phone, where that button still exists. The heading-order tests expect the levels one lower under the pane's `h2` ([2, 3, 3], line headings `h3`, or `h4` under a path). They still check that no level is skipped, counting from the list's `h1`.
- `change-list.test.tsx`: "Important" is found as an `h3` under the pane's `h2`; "opens an item with Enter" finds the item's name in the pane.
- `history.test.tsx`: "moves focus to a version's title…" expects the title as an `h2` in the content pane, and Escape still puts focus back on the row. "puts the details in a column beside the list…" checks the details are in the content pane and the list in the list column, still not after the list and Show more.
- `test-support/open-item.ts` finds an open item by the pane's `h2` as well as a page's `h1`.

New tests in `changes-columns.test.tsx` and `changes-pane-focus.test.tsx` cover `source-control.list-column`: the list column's whole kit size classes and the pane's, the header's wrap, the empty pane's words for a repository and "Changes" alone for a folder without history, opening rows and a version with one current row, Escape from the version, Undo these changes moving focus to the next row, a read nobody asked for leaving focus on Get updates, the choices taking the pane from an open item, a row put above the choices with Continue to bring them back, and a phone with no pane. No test was skipped or weakened: every changed test checks the same behaviour in the new layout, or on the phone where the old layout remains.

## Why

The board picked the two-column layout (HAL-20617). The build plan's P5 moves each screen onto it, and Library (`library.list-column`), Inbox and Runs already have it. What changed and a version's details are the natural contents of the Changes pane. As a page, What changed hid the list, so a person had to go back to the list for each item, and a version's details had no room in the list column. The diff view itself waits for Noah's and Sofia's designs, so it keeps its look and is only placed in the pane.

## Covers

- source-control.list-column
- source-control.whats-changed-page
- source-control.history-page
