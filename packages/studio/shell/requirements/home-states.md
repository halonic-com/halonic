# shell.home-states

- Status: active
- Since: 0.1.0
- Source: HAL-1290 (T2, PR 8); UX checklist part 1, 1.5 and 1.9 (HAL-1323); microcopy 3.3; kit 19.3; HAL-3926; HAL-3924; a11y 1.5 (HAL-1290 15b)

The shell shall load and fail each of Home's sections on its own. While a section's card loads, the shell shall show nothing for 300 ms, then skeleton rows hidden from screen readers, except for Get set up, which shows nothing until it has loaded. While any section shows its skeleton, the page shall say "Loading Home" once to screen readers, not once per section, unless a section shows its error with a reason: then the page shall say the reasons instead. If a section's card fails to load or to draw, then the shell shall show, in place of its rows, the start-aligned error with the section's "Couldn't load" title, the reason and **Try again**, and shall keep the other sections. The section's error shall not be a live region: while sections show their errors, the page shall say each of their reasons once to screen readers, not once per section, and shall not say a reason again when another section fails for it too. Each reason shall end in a full stop, so two reasons said together don't run into each other. An error without a reason shall say nothing to screen readers on its own. When **Try again** works, the shell shall move focus to the section's heading; when it fails again, to the error's title. The shell shall move focus only right after **Try again**: when the section later loads again, focus shall stay where it is.

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
- Given Needs you and Recent runs both fail because Halonic on your computer isn't answering,
  when Home shows,
  then both show their errors and screen readers hear "Halonic on your computer isn't answering." once.
- Given Needs you failed because Halonic on your computer isn't answering,
  when Recent runs is still loading after 300 ms,
  then Recent runs shows skeleton rows and screen readers hear "Halonic on your computer isn't answering.", not "Loading Home".
- Given Needs you failed because trust doesn't allow reading the inbox, with no full stop in the message,
  when Recent runs fails because Halonic on your computer isn't answering,
  then screen readers hear "Trust doesn't allow reading the inbox. Halonic on your computer isn't answering."
- Given Needs you and Recent runs are both loading,
  when Needs you fails with an error that has no message,
  then Needs you shows its error and screen readers still hear "Loading Home".
- Given Recent runs failed,
  when Try again is pressed and it loads,
  then focus is on the heading "Recent runs".
- Given Try again worked for Recent runs and focus has moved to Needs you,
  when Recent runs loads again,
  then focus stays on Needs you.
- Given a card's view failed to import,
  when Try again is pressed,
  then the view is imported again.
- Given Recent runs' card names a view its module doesn't export, and Needs you loads,
  when Home shows,
  then Recent runs shows "Couldn't load recent runs" with Try again, Needs you shows its rows, and the `ShellError` naming the view is reported to the console.
