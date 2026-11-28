# Decision: the rail may open a page a feature adds as an item kind, so Code opens Code's page; three files requirements name Code's page

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-20990 (Code in the new design, P5 of the HAL-20617 build plan; the board picked "Code like chats" on HAL-20742, 28 Nov 2026). Liam approves the change in review on HAL-20990.
- Kind: internal

## What changes

`studio.desktop-rail-selection` said the rail opens only pages that a desktop feature or the shell adds as a place. It now also allows a page that a desktop feature adds as an item kind, as Files adds Code's page (`code/workspace/files`, requirement `files.code-page`). It also says Code holds Code's page as well as a file, and gains an example for it.

The test that checked every `opens` key against the places now checks a place's key against the places and an item's key (`kind/hub/id`) against the item kinds. A key nothing draws still fails, so the test is no weaker for the keys it checked before. A new test checks that the Code entry opens Code's page, and the items table gains `code/workspace/files` in Code. No test was skipped or removed.

Three active files requirements spoke of every tree and every file tab, and Code's page is a second tree whose files open in its pane (review of #6924):
- `files.tree.keyboard`: Enter opens the focused file in a tab in the sidebar's tree, and in Code's content pane in Code's list column. The Enter example now names the sidebar's tree, and a second example covers Code's list column.
- `files.ui.file-tab`: the sidebar's Files view opens a file in a tab, and Code's page in its pane. A Ctrl-click, Cmd-click or middle click on a file row in either tree opens a new tab; the PR gives the sidebar's tree that too, so the requirement now says it, with an example. The rest holds for a file in its tab or in Code's pane alike. The Enter example now names the sidebar's tree.
- `files.ui.file-tab-header`: Rename and F2 ask the sidebar's tree and show the Files view, except in Code's pane, where they edit the name in Code's list column and leave the sidebar as it is.

No example was removed. The tests these requirements had all still pass unchanged; new tests cover Code's page.

## Why

Code's page has no place. A new place would mean adding `code` to the shell's fixed place list and its names (`sidebarPlaces`, `placeNames`), which also puts a Code row in the sidebar and changes the shell's public interface. An item kind is something a feature already adds on its own, so the page stays inside the files package. What the rule guards against, a rail entry that opens a page nothing draws, holds either way.

## Covers

- studio.desktop-rail-selection
- files.tree.keyboard
- files.ui.file-tab
- files.ui.file-tab-header
