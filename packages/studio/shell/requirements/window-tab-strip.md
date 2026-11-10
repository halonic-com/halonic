# shell.window-tab-strip

- Status: active
- Since: 0.1.0
- Source: HAL-1290 (T2); base component specs 24.5 (window tabs); UX checklist part 1, 1.2 (HAL-1323); visual review kit T2-F37, F38 (HAL-3056)

The shell shall show a workspace's window tabs as one `tablist` named "Open tabs" that is a single Tab stop, with only one tab in the Tab order: the focused tab while the focus is in the strip, and otherwise the active tab. Each tab shall be named by its place's title, then its item kind if it has one, then "needs you" when its item waits for a person, joined with ", ", and only such a tab shall show the needs-you dot. In the strip, ← and → shall move the focus to the previous and next tab without wrapping, Enter and Space shall make the focused tab active, Delete shall close the focused tab and keep the focus in the strip, and Ctrl Shift PageUp and PageDown shall move the focused tab one place left or right with the focus on it. Other keys, and these keys with other modifiers, shall be left to the window. A click on a tab shall make it active. Each tab shall have a close button named "Close" and the tab's title, which is not a Tab stop, does not take the focus on a click, and is shown on the active tab, and on the others only on hover or keyboard focus, keeping its place when hidden. A **+** button named "New tab" after the strip shall open a new tab on Home at the end and tell the frame. The strip shall follow the tab set, so a renamed place shows its new title at once. Nothing on a tab shall use `fg-subtle`. Screen readers do not announce the close button's name, because a tab's children are presentational; Delete is how they close a tab.

## Examples

- Given tabs "Agents", "Sorter" (an agent) and "Support reply" (a workflow), with "Sorter" active,
  then the tabs are named "Agents", "Sorter, agent" and "Support reply, workflow", and only "Sorter" is in the Tab order.
- Given the focus on "Sorter",
  when the user presses Delete,
  then "Sorter" closes, "Support reply" becomes active and has the focus.
- Given the focus on "Sorter",
  when the user presses Ctrl Shift PageDown,
  then the strip reads "Agents", "Support reply", "Sorter", with the focus still on "Sorter".
- Given the focus moved to "Agents" and then left the strip,
  when "Support reply" becomes active from outside the strip,
  then only "Support reply" is in the Tab order.
- Given "Support reply" waits for a person,
  then its tab is named "Support reply, workflow, needs you" and shows the 6px dot.
