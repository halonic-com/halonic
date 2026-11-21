# first-run.one-state

- Status: active
- Since: unreleased
- Source: HAL-14963 (from the review of #4271, HAL-13433)

When a folder that stays open is shown again, the First Run feature shall read the device's first-run state again, so its bar, guide card and Inbox setup item show what another open folder changed. When the user acts on the first run in a folder, the First Run feature shall apply the action to the state the device holds at that moment, and an action or run that belongs to the folder the first run is in shall change nothing once the first run has moved to another folder. When the device starts remembering a folder that is already open as the demo, the First Run feature shall start the first run there, as it does when the demo opens.

## Examples

- Given the first run is on in the demo and another folder is open beside it,
  when the user presses **Skip, I'll explore** in the demo and then shows the other folder,
  then the other folder sees the first run paused in the demo.
- Given a folder still holds the first run as on there,
  when **Show the guide** in another folder has begun it again over there,
  then a run or **Skip, I'll explore** in the first folder leaves it on over there.
- Given a folder of the Acme sample that is open but not remembered as the demo,
  when **Open demo** opens that folder,
  then the first run turns on at Demo there.
