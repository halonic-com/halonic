# shell.more-page

- Status: active
- Since: 0.1.0
- Source: HAL-1290 (T2, PR 14c); component specs 15.2 "The More page" (HAL-175); phone layout 2 (HAL-330); visual review kit T2-F11 (HAL-1115)

Where the Studio shows the phone layout and the app has a workspace picker, the More page shall show the workspace switcher as its first row, a button named with the workspace's name followed by "Change workspace", and shall pass a tap on it on. Where the app has no workspace picker, the page shall show no switcher row. Where a header badge is given, the page shall show it on its own line under the switcher row. The page shall then list the places that live under More, Agents, Workflows, Routines, Library and Changes, in that order and only where a feature added them, each with its icon and a chevron, and a place with a count shall show the count in place of the chevron. When a listed place is tapped, the shell shall pass that place on. The page shall end with the line "Editing workflows is easier on a computer.", and shall have an `h1` "More" for screen readers.

## Examples

- Given the workspace "Acme" in "~/Work/acme",
  when the More page renders,
  then its first control is a button named "Workspace: Acme. Change workspace" showing "Acme" over "~/Work/acme".
- Given the places Home, Inbox, Workflows, Runs, Agents and Changes added,
  when the More page renders,
  then it lists Agents, Workflows and Changes, in that order.
- Given Changes with 4 to review,
  when the More page renders,
  then the Changes row shows the count 4 and no chevron.
- Given the More page,
  when the user taps Workflows,
  then the shell is told "workflows".
- Given the sample workspace's header badge,
  when the More page renders,
  then the badge shows under the switcher row, outside its button.
- Given only Home added,
  when the More page renders,
  then it shows the switcher row and the footer line, and no list.
- Given no workspace picker,
  when the More page renders,
  then it shows no switcher row, and still shows its `h1` and the footer line.
