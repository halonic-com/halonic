# first-run.setup-item

- Status: active
- Since: unreleased
- Source: HAL-13433 (first-run build 5); first-run-flow 5, "Set up later and Skip, I'll explore" (HAL-7985); `inbox.setup-items`, `inbox.setup-item-open`; flow check C600 #5 (HAL-15609, toast decided by the team under HAL-2282); words check C629 row 27 (HAL-15781, HAL-15792: the toast's title takes a full stop, microcopy 1.3)

While the first run (`first-run.state`) is paused in the open folder, the First Run feature shall give the Inbox one setup item, "Finish your first run", with the line "Step *n* of 4 · *step*" for the step it was paused at, such as "Step 1 of 4 · Demo". Opened, the item shall show its title, which takes focus, a four-piece progress line with the steps before the paused one filled, the step line, and the buttons **Continue** and **Dismiss**. **Continue** shall take the first run up again at its step and open Support reply's page. **Dismiss** shall close the item, so it doesn't come back, and show the toast "First run dismissed." with the line "To bring it back, pick Help › First run › Show the guide again."; **Show the guide again** (`first-run.help`) takes the first run up again at its step. The item shall be gone once the first run is on again, dismissed or done, and it shall not show in another folder.

## Examples

- Given the user pressed **Skip, I'll explore** at Demo,
  when the Inbox lists its items,
  then "Finish your first run" is there with "Step 1 of 4 · Demo".
- Given that item is open,
  when the user presses **Continue**,
  then the first run is on at Demo again, Support reply's page opens, and the item is gone.
- Given that item is open,
  when the user presses **Dismiss**,
  then the item is gone, it doesn't come back after a restart, and the toast "First run dismissed." says "To bring it back, pick Help › First run › Show the guide again.".
