# kit.setup-steps

- Status: active
- Since: unreleased
- Source: HAL-12728, HAL-13121, HAL-13410; first-run check F12 (HAL-12714), L7 (HAL-12721); Get set up, phone design HAL-477 2.2; first-run flow 3.3 (HAL-663)

The kit's `SetupSteps` shall draw a setup card's steps as one List named by its `label`, a row per step in the given order, each with its title, its hint under it and, before the title, a 24px circle hidden from screen readers. While a step isn't done, its title shall be in `fg` and a chevron shall sit at the row's right edge, and its circle shall be outlined in `border-strong` with the step's number in `fg-muted`, unless its `check` draws it (`kit.setup-steps-check`). Once a step is done, its circle shall be filled `success` with a tick in `on-success` in place of the number, its title shall be in `fg-muted` and not struck through, and its row shall have no chevron. A row shall be at least 56px high and wrap the step's title and hint at any width rather than cut them with an ellipsis, growing with them, with its circle at the top beside the title and its chevron centred on the row at its right edge. Each row shall be read by screen readers as the step's `label`, described by the step's hint, and Enter or a click on the row of a step that isn't done shall call `onOpen` with the step's id, while on a done step's row it shall do nothing. A done step's row shall have no hover or press tint and the default cursor, and Tab shall enter the steps at the first step still to do, while the arrow keys still reach the done steps' rows.

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
- Given a done step 1 and a step 2 still to do,
  when the user tabs into the steps,
  then focus lands on step 2, ↑ moves it to step 1, whose row has the default cursor and no hover tint,
  and Enter there doesn't call `onOpen`.
- Given the step "Approve or reject the reply" with the hint "The run waits for you before it finishes." on a 320px phone,
  when the steps render,
  then the title and the hint wrap whole, with no "…", the circle stays beside the title,
  and a screen reader hears "Step 2 of 3: Approve or reject the reply, not done. The run waits for you before it finishes."
