# messenger.activity-panel-parts

- Status: active
- Since: unreleased
- Source: HAL-19082 (Noah's design check of the activity panel, items 16 to 20, against the HAL-18558 activity-panel mockup, revision 3)

While the activity panel shows a task, its task card shall sit on the subtle fill with its border and show the run's state as a status chip after the task's identifier: "In progress" while the run goes, and Done, Failed or Stopped once it ended; while the run waits to start, the card shall show no chip, as the status line already says "Starting". The chat header's button, the panel's close button, **‹ Chief**, **‹ Channel** and **Show activity** shall be keyboard-focusable with the kit's focus ring and at least 24px high; the header button and the close button shall be the kit's icon buttons, and the header button shall show the pressed fill while the panel is open, the kit's tooltip "Activity (Ctrl+I)", and its 8px working dot while the panel is closed and the agent works.

## Examples

- Given Chief's run on ACME-7 is going,
  when the panel shows it,
  then the task card shows ACME-7 and an "In progress" chip.
- Given Chief's last run failed,
  when the panel shows it,
  then the task card shows a "Failed" chip in the danger tone.
- Given Chief's run on ACME-7 is queued,
  when the panel shows it,
  then it says "Starting" and the task card shows ACME-7 with no chip.
- Given a narrow window,
  when the panel opens,
  then **‹ Chief** has the kit's focus ring and is at least 24px high.
- Given the panel is open,
  when the chat header renders,
  then its button is pressed and has the kit's focus ring and pressed fill.
