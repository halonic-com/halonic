# shell.rail

- Status: active
- Since: unreleased
- Source: HAL-20676 (P3 of the HAL-20617 build plan); HAL-20673 rail flows, lines 2a, 31, 32, 34 and 36, revision 2; places resolved through item kinds, HAL-20721 (option B)

The icon rail shall show its entries in a `nav` named "Places", one button each with the entry's name as its tooltip and accessible name, and Settings at the bottom apart from the others. The shell shall let each rail entry name the places it holds, such as `agents`, and an item kind no place lists, such as `file`. The shell shall count a tab as in the place its key starts with, or, for an item, in the place its kind registers (`ItemKindContribution.place`), so `agent/acme/sorter` is in Agents. While the active tab is in a place an entry holds, the rail shall mark that entry selected (`aria-current="page"`), whether the tab was opened from the rail, by a tab click, Back, a search result, the palette or a link. While no entry holds the active tab's place, the rail shall mark no entry selected. When the person clicks an entry that has a page and isn't selected, the rail shall open that page in the active tab and move the focus to the page's `h1`. When the person clicks the selected entry, or an entry with no page yet, the rail shall leave the active tab as it is. When the person clicks Settings, the rail shall open the Settings dialog and shall not mark Settings selected. Where the kit doesn't draw an entry's icon, the rail shall show the dashed ring. If two rail entries hold the same place or kind, Home's `home` included, then `rail.add` shall throw a `ShellError` that names both entries. If, once every feature has registered, one entry holds an item kind whose place another entry holds, then `createShell` shall throw a `ShellError` that names both entries.

## Examples

- Given Library holds `agents` and the kind `agent` registers the place `agents`,
  when the active tab shows the agent `agent/acme/sorter`,
  then Library is selected.
- Given a new kind registers the place `workflows`, which Library holds,
  when the active tab shows one of its items,
  then Library is selected without Library's entry changing.
- Given the active tab shows the Search page,
  when the rail is shown,
  then no entry is selected.
- Given the active tab shows Home,
  when the person clicks Inbox,
  then the active tab shows the Inbox, Inbox is selected, and the focus is on the Inbox's heading.
- Given the active tab shows the agent Sorter,
  when the person clicks Library,
  then the tab still shows Sorter.
- Given Messenger has no page yet,
  when the person clicks it,
  then the active tab stays as it was.
- Given _inbox_ and _mail_ both hold `inbox`,
  when the shell is created,
  then a `ShellError` names both entries.
