# first-run.help

- Status: active
- Since: unreleased
- Source: HAL-13433 (first-run build 5, build notes 4); first-run-flow 3.5 and 5, "Help › First run" and "Start over", and 10.2 R8 (HAL-7985); `shell.help-menu`

The First Run feature shall add the group "First run" to the Help menu. In a folder the device remembers as the demo, it shall hold **Show the guide**, which takes a first run paused here up again, begins it again at Demo here when it is off, done, dismissed or in another folder, and opens Support reply's page, where the guide card is. Where the app can copy the demo again, it shall hold **Start over**, which turns the first run off and asks the app for a fresh copy of the demo in the next free folder (`workspace.fresh-copy-asks`), which never writes into a folder that is there; the copy, once open, starts the first run at Demo. With neither item, the group shall not show.

## Examples

- Given the first run was won in the demo,
  when the user picks **Help › First run › Show the guide**,
  then the first run is on at Demo again and Support reply's page opens with the guide card.
- Given the first run is paused at Model,
  when the user picks **Show the guide**,
  then it is on at Model again.
- Given the demo is open,
  when the user picks **Start over**,
  then the app makes the next free copy, such as `Acme sample 2`, opens it, and the first run starts there at Demo.
- Given a folder that isn't the demo, in a window without Open demo,
  when the Help menu opens,
  then it has no "First run" group.
