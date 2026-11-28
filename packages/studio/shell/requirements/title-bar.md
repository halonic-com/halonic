# shell.title-bar

- Status: active
- Since: unreleased
- Source: HAL-1290 (T2); design direction 2 (HAL-49); UX checklist part 1, 1.1 (HAL-1323), 1.12 (HAL-3868); microcopy 19.2 (HAL-751); board design decisions 13 Nov (HAL-8416, HAL-8421); the tabs above the content pane, HAL-20676 (P3 of the HAL-20617 build plan)

The shell shall put no toolbar row above the page. The desktop title bar shall show, from the left, the Halonic mark and the words "Halonic Studio", then Back and Forward for the active tab; the window tabs sit above the content pane instead (`shell.frame`). The mark and the words shall be neither a link nor a button. Under 900px the words shall go and the mark shall stay, named "Halonic Studio". Back and Forward shall move the active tab one place through its history and then move focus to the new page's `h1`; with nowhere to go, focus shall stay where it is. When there's nowhere to go, Back and Forward shall be unavailable but stay in the Tab order, with the reason "Nothing to go back to" or "Nothing to go forward to" as their description, always in the page. Back and Forward shall follow the tab set. While a feature adds a panel window (`shell.panel-window`), the title bar shall end, at its right end, with that panel's button: ✦ and the panel's title, such as "Assistant", a toggle whose `aria-expanded` says whether the panel is open, with the panel's title as its tooltip, followed by the Kbd hint of the panel's keys when the feature gives them, which `aria-keyshortcuts` names too. Pressing it shall open the panel when it is closed and close it when it is open. With no panel window there shall be no such button. The status bar shall end with the workspace's save note, and shall begin with the workspace's header badges, which take no room when there are none.

## Examples

- Given a tab that went from Home to "Workflows" to "Support reply",
  then Back is available and Forward is unavailable with the reason "Nothing to go forward to".
- Given that tab,
  when the user presses Back,
  then the tab shows "Workflows" and focus is on the page's `h1`, "Workflows".
- Given a window 1440px wide,
  then the title bar reads "Halonic Studio" before Back and Forward.
- Given a window 800px wide,
  then the title bar shows the mark named "Halonic Studio" and no words.
- Given the _assistant_ feature adds the panel window "Assistant" with the keys "Ctrl+Alt+I", on Windows,
  then the title bar ends with the "Assistant" button, not expanded, with `aria-keyshortcuts` "Control+Alt+I" and the tooltip "Assistant" with Ctrl Alt I; pressing it opens the panel and the button is expanded.
- Given no feature adds a panel window,
  then the title bar has no button after the window tabs.
- Given the status bar,
  then "Not trusted yet", when it applies, comes first, the other items follow and "✓ Saved" is at the right end.
