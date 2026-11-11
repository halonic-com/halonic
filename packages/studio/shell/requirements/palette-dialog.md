# shell.palette-dialog

- Status: active
- Since: 0.1.0
- Source: HAL-1290 (T2); component specs 24.3 (HAL-175); UX checklist part 1, 1.7 (HAL-1323); search frames T2-F6, F22 to F25 (HAL-1494, HAL-1501); microcopy 3.5 and 19.2

When the Ctrl K palette opens, it shall show a modal box named "Search" with the focus in its search row, a combobox that says "Search" while it is empty and keeps the focus while ↓ and ↑ move the active option. The palette shall show each group under its title, name each group by it, and mark the active option with a fill and a 2px accent bar, so it isn't told by colour alone. Each row shall show, for a place, the outline icon the sidebar draws for it, then its name with the typed words marked, its detail, and "Switch to tab" when a window tab shows it. When the user clicks a row, the palette shall open it here, or in a new tab with Mod or the middle button, and keep the focus in the search row. While search providers are looking, the palette shall show two still skeleton rows after the names. When words find no place or item, the palette shall say "Nothing matches" with the words, or, if a search provider failed, "Couldn't search" with the engine's reason and a Try again button that asks the providers again. When typing has stopped for 500 ms and the providers have answered, the palette shall say the count politely, and when it shows "Couldn't search" above the actions, it shall say that first, as in "Couldn't search, 1 result". The footer shall show the keys Enter, Mod Enter and Esc with what they do.

## Examples

- Given the palette is open with nothing typed and a tab shows the workflow "Support reply",
  when it shows,
  then "Support reply" is active under Open tabs and reads "Support reply, workflow, switch to tab".
- Given the palette is open with nothing typed and a tab shows Agents,
  when it shows,
  then the box says "Search", and the Agents and Home rows start with the sidebar's Agents and Home icons.
- Given the user typed "refund" and a provider is still looking,
  when the palette shows,
  then two skeleton rows follow the names and no count is said.
- Given the only provider failed for "new" and the action "New tab" matches,
  when typing has stopped for 500 ms,
  then the palette shows "Couldn't search" with the engine's reason and Try again above Actions, and says "Couldn't search, 1 result".
- Given the user Ctrl-clicks "Refund checker",
  when the click ends,
  then it opens in a new tab and the focus stays in the search row.
