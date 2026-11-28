# library.library-page

- Status: active
- Since: unreleased
- Source: HAL-1303 (T10, P4a); HAL-9897; flow-library 3.1; microcopy 11.1; HAL-20734 (kind chips in the new design)

The Library page shall show four kind chips, a one-of row named "Library", in the order Skills, Knowledge, Collections, Connectors, with the selected kind's chip on; on a phone, which shows one kind's list and no chips, one sentence under the title follows the kind, and on the desktop the content pane says it (`library.list-column`). Under them it shall show the shell's overview page with the selected kind's items from the host, in the words of microcopy 11.1 for each state, and a New button only on the kinds that have one (not Knowledge). An empty Knowledge kind offers Open the docs folder when the app gives it. A kind whose items haven't arrived shows loading, never the previous kind's rows. It shall say "Couldn't load" with the kind's name, and read the items again on Try again or when the host says something changed. A kinded error's own reason shows; any other error shows no reason, so a system message never reaches the user. A later read that fails keeps the list it has and adds a line with Try again above it. Each row's ⋮ menu shall list Open, Open in new tab, Open as file (desktop only) and Delete, in that order; on a phone Open in new tab does the same as Open, as the plugin list does. While nothing is listed, the kind has no search field and its one button is in the empty state (Open the docs folder on Knowledge, New skill or New collection elsewhere).

## Examples

- Given Skills is selected,
  when the page shows,
  then the Skills chip is on and the button is "New skill".
- Given the user selects Knowledge,
  when the kind changes,
  then the page asks for the knowledge items and has no New button.
- Given the host has no collections,
  when Collections shows,
  then it says "No collections yet".
- Given the host fails with "The workspace folder is gone.",
  when Connectors shows,
  then it says "Couldn't load connectors" and that reason (it is a kinded error), and Try again asks the host again.
- Given Knowledge is empty and the app can open the docs folder,
  when the page shows,
  then the empty state has the button "Open the docs folder".
- Given the user switches from Skills to a kind whose items are still on their way,
  when the kind changes,
  then no skill row shows.
- Given Skills shows rows,
  when a later read fails with a system error,
  then the rows stay, a line says "Couldn't load skills." with Try again, and the error's text isn't shown.
- Given the host has no skills,
  when Skills shows,
  then there is no search field and "New skill" appears once, in the empty state.
- Given a row's ⋮ menu is open on the desktop app,
  when the menu shows,
  then it lists Open, Open in new tab, Open as file and Delete in that order, and Open and Open in new tab open the row's item.
