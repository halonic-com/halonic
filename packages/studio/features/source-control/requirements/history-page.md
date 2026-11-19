# source-control.history-page

- Status: active
- Since: unreleased
- Source: HAL-10664 (T9); HAL-12617 (a11y check C2); ux-checklists-t8-t9 (HAL-1360) part 2, 2.9 and 2.10; save model 2.8

The Changes page shall show these under "History", below the changes, grouped by day ("Today", "Yesterday", then the date), each row with the version's name, its author and the time. A version picked with a click or Enter shall show beside the list its name, author, date, notes and the files in it, never only on hover, and focus shall move to its name there, so a screen reader reads it; Escape there shall put focus back on the version's row; ↑ ↓ move between versions. While the first read works it shall show skeleton rows labelled "Loading history"; an empty history shall say "No versions yet."; a failed read shall say "Couldn't load history" with the reason and Try again. A folder that is not a git repository shall show no History and say "History is off. Everything you save is used right away." under "Keep a history of your work".

## Examples

- Given the person picks "Sorter replies in Dutch",
  then its author, date, notes and files show beside the list.
- Given the person presses Enter on "Sorter replies in Dutch",
  then focus is on its name beside the list,
  and Escape puts focus back on its row.
- Given a folder without git,
  then the page says history is off and shows no History.
