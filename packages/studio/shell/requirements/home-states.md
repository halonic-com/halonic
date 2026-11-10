# shell.home-states

- Status: active
- Since: 0.1.0
- Source: HAL-1290 (T2, PR 8); UX checklist part 1, 1.5 and 1.9 (HAL-1323); microcopy 3.3; kit 19.3

The shell shall load and fail each of Home's sections on its own. While a section's card loads, the shell shall show nothing for 300 ms, then skeleton rows hidden from screen readers, except for Get set up, which shows nothing until it has loaded. While any section shows its skeleton, the page shall say "Loading Home" once to screen readers, not once per section. If a section's card fails to load or to draw, then the shell shall show, in place of its rows, the start-aligned error with the section's "Couldn't load" title, the reason and **Try again**, and shall keep the other sections. When **Try again** works, the shell shall move focus to the section's heading; when it fails again, to the error's title.

## Examples

- Given Needs you and Recent runs are both loading,
  when 300 ms have passed,
  then both show skeleton rows and screen readers hear "Loading Home" once.
- Given Get set up is loading,
  when 300 ms have passed,
  then it shows no skeleton and nothing is said.
- Given Recent runs fails with an internal error and Needs you loads,
  when Home shows,
  then Recent runs shows "Couldn't load recent runs" with Try again, without the error's own message, and Needs you shows its rows.
- Given Recent runs failed,
  when Try again is pressed and it loads,
  then focus is on the heading "Recent runs".
- Given a card's view failed to import,
  when Try again is pressed,
  then the view is imported again.
