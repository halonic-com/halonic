# shell.phone-search

- Status: active
- Since: 0.1.0
- Source: HAL-1290 (T2); component specs 24.3 "On a phone" and 15.3 (HAL-175); UX checklist part 1, 1.14 (HAL-1323); phone search frames T2-F15 to F19 (HAL-1443); microcopy 3.6

When the phone's Search sheet opens, it shall show a full-screen sheet titled "Search" with Close, put the focus in its search field, and, with nothing typed, list only the places opened lately, since a phone has no window tabs. The sheet shall show the Ctrl K palette's groups, words and match marks, each row 56px with its kind line under the name, or 48px without one, and no footer or key hints. The sheet shall ask the search providers as the words change, as the Ctrl K palette does. When the user taps a row, or presses Enter in the field, the sheet shall close and open the place or the item on the phone, or run the action with its feature's context; Enter opens the first row unless an external keyboard's arrow keys moved the active row. The sheet shall show the active row's bar only once an arrow key moved it. While search providers are looking, the sheet shall show two still skeleton rows and say "Searching" to screen readers. When words find no place or item, the sheet shall say "Nothing matches" with the words and no Enter hint, or, if a search provider failed, "Couldn't search" with the engine's reason and Try again. When typing has stopped for 500 ms, the sheet shall say the count politely. When the user presses Close or Android back, the sheet shall close.

## Examples

- Given the phone showed Runs last,
  when the Search sheet opens,
  then the focus is in the field and the sheet lists Recent, "Runs" then "Home", with no Open tabs.
- Given the user typed "refund" and a provider found Refund checker, an agent in acme,
  when the user presses Enter,
  then the sheet closes and the phone opens Refund checker.
- Given the only provider failed for "fail",
  when it answers,
  then the sheet shows "Couldn't search", "Halonic on your computer isn't answering." and Try again, and "fail" stays in the field.
