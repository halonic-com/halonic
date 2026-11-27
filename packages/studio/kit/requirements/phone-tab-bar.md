# kit.phone-tab-bar

- Status: draft
- Since: unreleased
- Source: HAL-19092 (Noah's design check HAL-19082, item 1; HAL-17514 `screens` group 3, p02a); HAL-20106 (the shell's bottom navigation on it: links, problems and the running dot)

The kit's `PhoneTabBar` shall show a phone screen's own views as a `nav`, named by its `label`, at the bottom of the screen, with a line on top and the home bar's inset below it. Each tab shall be a button holding its icon over its label, sharing the width equally, or a link when it has an address, which the bar never follows. The picked tab shall be `aria-current="page"`, with its filled icon on the halo pill; a tab whose count is above 0 shall show that count beside its icon, inside the pill, after a warning mark when it counts problems, and a tab with something running and no count shall show the still running dot at its icon's corner. A screen reader shall hear the count's or the dot's words after the tab's name. Tapping a tab shall call `onSelect` with its id.

## Examples

- Given tabs Inbox, with a count of 3 named "3 waiting", and Agents, with Inbox picked,
  when the bar renders,
  then it is a `nav` named after its label, Inbox is `aria-current="page"` and shows 3, and Inbox's button reads "Inbox, 3 waiting".
- Given the same bar,
  when the person taps Agents,
  then `onSelect` gets `agents`.
- Given a Runs tab with the address "#runs" and something running, named "1 running",
  when the bar renders and the person taps it,
  then it is a link named "Runs, 1 running" with the running dot, the address isn't followed, and `onSelect` gets `runs`.
- Given Inbox's count is 0,
  when the bar renders,
  then Inbox shows no count.
