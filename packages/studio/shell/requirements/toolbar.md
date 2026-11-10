# shell.toolbar

- Status: active
- Since: 0.1.0
- Source: HAL-1290 (T2); design direction 2 (HAL-49); UX checklist part 1, 1.1 (HAL-1323), 1.12 (HAL-3868); microcopy 19.2 (HAL-751)

The shell shall show a toolbar with Back and Forward for the active tab, then the active tab's path as a `nav` named "Location", then the workspace's header badges and its save state. The path shall be the places above the active tab's place, outermost first, each a link, then the place itself, marked as the current page and not a link; with nothing above it, the path shall be the place alone. Back and Forward shall move the active tab one place through its history and then move focus to the new page's `h1`; with nowhere to go, focus shall stay where it is. When there's nowhere to go, Back and Forward shall be unavailable but stay in the Tab order, with the reason "Nothing to go back to" or "Nothing to go forward to" as their description, always in the page. A click on a link in the path shall open its place in the active tab, without the browser following the link. A Ctrl-click, a Cmd-click or a middle-click shall open it in a new tab next to the active one, which stays active, and announce "Opened <place> in a new tab."; if a tab already shows the place, the tabs shall stay as they are and "<place> is already open in a tab." shall be announced. When the toolbar is too narrow for the whole path, every part shall shorten with "…" rather than push another out, and the place itself shall keep the most room. The toolbar shall follow the tab set. With no badges, the badge slot shall take no room. The toolbar shall have no Assistant button until the Assistant feature exists.

## Examples

- Given a tab that went from Home to "Workflows" to "Support reply", a workflow in Workflows,
  then the path reads "Workflows / Support reply", "Workflows" is a link, Back is available and Forward is unavailable with the reason "Nothing to go forward to".
- Given that tab,
  when the user presses Back,
  then the tab shows "Workflows", the path reads "Workflows" and focus is on the page's `h1`, "Workflows".
- Given that tab,
  when the user Ctrl-clicks "Workflows" in the path,
  then a tab on "Workflows" opens after it, "Support reply" stays active, and "Opened Workflows in a new tab." is announced.
- Given no header badges,
  then the toolbar ends with the path and the save state.
