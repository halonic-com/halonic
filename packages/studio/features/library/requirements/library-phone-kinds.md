# library.library-phone-kinds

- Status: active
- Since: unreleased
- Source: HAL-1303 (P9c); flow-library 8; Liam on HAL-11166

While the app is a phone, the Library place's page shall be a flush list of the four kinds (Skills, Knowledge, Collections, Connectors), and each row shall show how many items the kind has ("3 skills", "1 source", "2 collections", "2 connectors") and open that kind's list as a page of its own above it, with the kind's name as its title and heading and no tabs. The list of kinds also has a Plugins row when Settings has a plugins section, and that row opens it. The bottom navigation stays on both pages. A request for a tab (Alt+4 to Alt+7) while the list of kinds shows opens that kind's page.

## Examples

- Given a phone and the Library page,
  when it shows,
  then it lists the four kinds, each with its count, and no tabs.
- Given a phone and the list of kinds,
  when the user taps Knowledge,
  then the Knowledge list is pushed as a page.
- Given a phone and a pushed kind page,
  when it shows,
  then it has that kind's items under that kind's heading, with no tabs.
- Given a phone and Settings with a plugins section,
  when the list of kinds shows,
  then it has a Plugins row that opens that section.
- Given a phone and Settings without a plugins section,
  when the list of kinds shows,
  then it has no Plugins row.
