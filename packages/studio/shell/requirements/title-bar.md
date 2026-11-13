# shell.title-bar

- Status: active
- Since: 0.1.0
- Source: HAL-1290 (T2); design direction 2 (HAL-49); UX checklist part 1, 1.1 (HAL-1323), 1.12 (HAL-3868); microcopy 19.2 (HAL-751); board design decisions 13 Nov (HAL-8416, HAL-8421)

The shell shall put no toolbar row above the page. The desktop title bar shall show, from the left, the Halonic mark and the words "Halonic Studio", then Back and Forward for the active tab, then the window tabs. The mark and the words shall be neither a link nor a button. Under 900px the words shall go and the mark shall stay, named "Halonic Studio". Back and Forward shall move the active tab one place through its history and then move focus to the new page's `h1`; with nowhere to go, focus shall stay where it is. When there's nowhere to go, Back and Forward shall be unavailable but stay in the Tab order, with the reason "Nothing to go back to" or "Nothing to go forward to" as their description, always in the page. Back and Forward shall follow the tab set. There shall be no Assistant button until the Assistant feature exists. The status bar shall end with the workspace's save note, and shall begin with the workspace's header badges, which take no room when there are none.

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
- Given the status bar,
  then "Not trusted yet", when it applies, comes first, the other items follow and "✓ Saved" is at the right end.
