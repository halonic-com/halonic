# files.code-page

- Status: active
- Since: unreleased
- Source: HAL-20990 (P5 of the HAL-20617 build plan); HAL-20742 SCREENS.md (final), "1. Code", option A "Code like chats", picked by the board on 28 Nov 2026

When the person clicks the rail's Code entry, the Studio shall open Code's page in the active tab, and the rail shall keep Code selected while the tab shows Code's page or a file. Where the Studio shows the desktop layout, Code's page shall show the file tree (`files.ui.tree-view`) under the title "Code", which shows while the tree loads and when it can't load too, and its **New file** button in a list column of the kit's list-column size (`kit.list-column`), which scrolls on its own, and beside it a content pane that takes the rest of the width. While no file is open, the content pane shall say "No file open" with "Pick a file in the list to open it." under it. When the person clicks a file's row or presses Enter on it, the content pane shall show that file in the code editor (`files.ui.file-tab`), in place of the file it showed, the row shall be marked as the open file, and the tab shall stay on Code's page. A file the tree opens by itself, a new file or a renamed open file, shall show in the content pane the same way. When the person Ctrl-clicks, Cmd-clicks or middle-clicks a file's row, the Studio shall open the file in a new tab and leave the content pane as it is. When the person picks **Rename** or presses F2 in the content pane's file, the file's row in Code's list column shall show its name field, and the sidebar shall stay as it is; **Go to Files** in the content pane shall move the focus to Code's list column. Code's list column shall take no ask meant for the sidebar's tree, a file tab's **Rename** or another feature's request to show a path, and the content pane shall take no request to open a file at a line (`files.ui.open-at-line`): those go to the sidebar's tree and the file's own tab, even while Code's page is open in a tab behind. Where the Studio shows the phone layout, Code's page shall show the tree alone, and a file shall open as its own page.

## Examples

- Given a code folder and Home in the active tab,
  when the person clicks Code in the rail,
  then the tab shows Code's page and Code is selected in the rail.
- Given Code's page in a 1280 × 800 window,
  then the tree sits under "Code" in a column of the kit's list-column size, and the content pane reads "No file open".
- Given Code's page with `src/checkout/refunds.ts` open in the pane,
  when the person clicks `src/checkout/orders.ts`,
  then the pane shows `orders.ts`, its row is the open one, and the tab is still Code's page.
- Given Code's page,
  when the person Ctrl-clicks `README.md`,
  then `README.md` opens in a new tab and the pane is unchanged.
- Given Code's page on a phone,
  then the tree fills the page, with no content pane.
- Given Code's page with `models.yaml` in the pane,
  when the person presses F2 in its editor,
  then the `models.yaml` row in Code's list column shows its name field and the sidebar is unchanged.
- Given Code's page open in a tab behind a file's tab,
  when the person picks Rename in the file's tab,
  then the sidebar's tree shows the row's name field and Code's list column doesn't.
