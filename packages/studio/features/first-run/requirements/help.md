# first-run.help

- Status: active
- Since: unreleased
- Source: HAL-13433 (first-run build 5, build notes 4); first-run-flow 3.5 and 5, "Help › First run" and "Start over", and 10.2 R8 (HAL-7985); `shell.help-menu`; the lines under the items from Noah's Help sheet (HAL-7990), the board's decision C520-9 (HAL-14977, HAL-15164); words check C584 rows 4 and 6 (HAL-15480, decided by the team under HAL-2282); Start over turns the first run off only once the copy is written (HAL-15519)

The First Run feature shall add the group "First run" to the Help menu. In a folder the device remembers as the demo, it shall hold **Show the guide again**, which takes a first run paused or dismissed here up again at its step, begins it again at Demo here when it is off, done or in another folder, and opens Support reply's page, where the guide card is. In that folder, and where the app can copy the demo again, it shall hold **Start over**, which asks the app for a fresh copy of the demo in the next free folder (`workspace.fresh-copy-asks`), which never writes into a folder that is there, and turns the first run off once that copy is written, so the copy, once open, starts the first run at Demo. While the copy can't be written, the first run shall stay as it was. Under **Show the guide again** it shall say "Brings back the first-run bar and the guide card where you left off.", and under **Start over** "Copies Acme to a new folder and begins again at the first step. Your old copy stays where it is.". With neither item, the group shall not show.

## Examples

- Given the demo is open,
  when the user opens **Help**,
  then **Start over** says under it "Copies Acme to a new folder and begins again at the first step. Your old copy stays where it is."
- Given the first run was won in the demo,
  when the user picks **Help › First run › Show the guide again**,
  then the first run is on at Demo again and Support reply's page opens with the guide card.
- Given the first run is paused at Model,
  when the user picks **Show the guide again**,
  then it is on at Model again.
- Given the first run was paused at Model and its setup item dismissed,
  when the user picks **Show the guide again**,
  then it is on at Model again.
- Given the demo is open,
  when the user picks **Start over**,
  then the app makes the next free copy, such as `Acme sample 2`, opens it, and the first run starts there at Demo.
- Given the first run is on at Run in the demo,
  when the user picks **Start over** and the copy can't be written,
  then the first run is still on at Run, with its bar.
- Given a folder that isn't the demo, also in a window with Open demo,
  when the Help menu opens,
  then it has no "First run" group.
