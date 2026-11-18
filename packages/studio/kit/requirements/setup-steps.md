# kit.setup-steps

- Status: active
- Since: unreleased
- Source: HAL-12728; first-run check F12 (HAL-12714), L7 (HAL-12721); Get set up, phone design HAL-477 2.2; first-run flow 3.3 (HAL-663)

The kit's `SetupSteps` shall draw a setup card's steps as one List named by its `label`, a row per step in the given order, each with its title, its hint under it and, before the title, a 24px circle hidden from screen readers. While a step isn't done, its circle shall be outlined in `border-strong` with the step's number in `fg-muted`, its title shall be in `fg`, and a chevron shall sit at the row's right edge. Once a step is done, its circle shall be filled `success` with a tick in `on-success` in place of the number, its title shall be in `fg-muted` and not struck through, and its row shall have no chevron. Each row shall be read by screen readers as the step's `label`, and Enter or a click on the row of a step that isn't done shall call `onOpen` with the step's id, while on a done step's row it shall do nothing.

## Examples

- Given the steps "Start a support request" (done) and "Approve or reject the reply" (not done),
  when the steps render,
  then the first row shows a filled `success` circle with a tick, its title in `fg-muted` and no chevron,
  and the second row shows "2" in an outlined circle, its title in `fg` and a chevron.
- Given a step with the label "Step 2 of 3: Approve or reject the reply, not done",
  when a screen reader reads its row,
  then it hears that sentence, and a click on the row calls `onOpen` with the step's id.
- Given a done step,
  when its row is clicked,
  then `onOpen` isn't called.
