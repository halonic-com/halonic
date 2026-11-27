# shell.rail

- Status: active
- Since: unreleased
- Source: HAL-20676 (P3 of the HAL-20617 build plan); HAL-20673 rail flows, lines 2a, 31, 34 and 36, revision 2

The icon rail shall show its entries in a `nav` named "Places", one button each with the entry's name as its tooltip and accessible name, and Settings at the bottom apart from the others. Each rail entry shall name the tabs it holds by the first part of a tab's key: a place, such as `agents`, or an item kind, such as `agent`. While the active tab shows something an entry holds, the rail shall mark that entry selected (`aria-current="page"`), whether the tab was opened from the rail, a tab click, a search result, the palette or a link; while no entry holds it, no entry shall be selected. When the person clicks an entry that has a page, the rail shall open that page in the active tab and move the focus to the page's `h1`. When the person clicks Settings, the rail shall open the Settings dialog, and Settings shall never be selected.

## Examples

- Given Library holds `agents` and `agent`,
  when the active tab shows the agent `agent/acme/sorter`,
  then Library is selected.
- Given the active tab shows the Search page,
  when the rail is shown,
  then no entry is selected.
- Given the active tab shows Home,
  when the person clicks Inbox,
  then the active tab shows the Inbox, Inbox is selected, and the focus is on the Inbox's heading.
- Given the person clicks Settings,
  when the rail is shown,
  then the Settings dialog opens and Settings isn't selected.
