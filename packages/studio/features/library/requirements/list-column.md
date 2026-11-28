# library.list-column

- Status: active
- Since: unreleased
- Source: HAL-20734; `kit.list-column` (HAL-20769); build plan HAL-20617, phases P3 and P5; part recipes on HAL-20672 (list panel); rail flows HAL-20673, line 35

Where the Studio shows the desktop layout, the Library place shall show the Library page in a list column of the kit's list-column size (`kit.list-column`), which scrolls on its own, and beside it a content pane that takes the rest of the width. The content pane shall be named by the selected kind and show its name as a heading with the kind's sentence under it, in the words of microcopy 11.1, under the Library's place icon. In the list column, the selected kind's New button shall sit on the title's line, right of "Library", or under it where the column is too narrow for both, so the search field takes the column's full width; an empty kind keeps its New button in its empty state only. Where the Studio shows the phone layout, the Library shall show its list alone.

## Examples

- Given the Library on Skills in a 1280 × 800 window,
  then the list column takes the kit's list-column size (34%, at least 208px, at most 380px), and the content pane reads "Skills" and "Instructions your agents can pick up when a task calls for them."
- Given the Library on Skills with items, in a 800 × 600 window,
  then "New skill" sits right of the "Library" title, and the search field under the chips spans the column.
- Given the user picks the Knowledge chip,
  then the content pane reads "Knowledge" and "Documents your agents can search."
- Given the Library on a phone,
  then the list fills the page, with no content pane.
