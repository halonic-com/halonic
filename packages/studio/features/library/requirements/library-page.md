# library.page

- Status: active
- Since: 0.1.0
- Source: HAL-1303 (T10, P4a); flow-library 3.1; microcopy 11.1

The Library page shall show four tabs in the order Skills, Knowledge, Collections, Connectors, with one sentence under the title that follows the selected tab. Under them it shall show the shell's overview page with the selected tab's items from the host, in the words of microcopy 11.1 for each state, and a New button only on the tabs that have one (not Knowledge). It shall say "Couldn't load" with the tab's name, and read the items again on Try again or when the host says something changed.

## Examples

- Given the Skills tab is selected,
  when the page shows,
  then the sentence is "Instructions your agents can pick up when a task calls for them." and the button is "New skill".
- Given the user selects Knowledge,
  when the tab changes,
  then the page asks for the knowledge items, shows "Documents your agents can search." and has no New button.
- Given the host has no collections,
  when the Collections tab shows,
  then it says "No collections yet".
- Given the host fails with "The workspace folder is gone.",
  when the Connectors tab shows,
  then it says "Couldn't load connectors" and that reason, and Try again asks the host again.
