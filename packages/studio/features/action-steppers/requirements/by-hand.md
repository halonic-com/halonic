# action-steppers.by-hand

- Status: active
- Since: unreleased
- Source: HAL-17527 (approvals stream HAL-17488, PR 8); architecture note on HAL-17491; the board's decision on HAL-10 (24 Nov) that the screens follow the approved Inbox look, section 7.8 (the manual guide, the board's request of 24 Nov 13:21 UTC)

While a request is ready, the stepper shall offer **Do it all by hand**, with every step's manual form (the page, the numbered instructions and how to check it worked), and **Do it by hand** on each step not done yet, which shall open by itself when the step failed. While the service is down, the stepper shall say so above the steps and open **Do it all by hand** by itself, and no step's own **Do it by hand**. **Mark done by hand** shall run the step's check where it has one, and otherwise record it as done by hand. A step done by hand shall say "Checked: <what the check found>", or "Done by hand, not checked".

## Examples

- Given step 1 failed with status 503,
  when the request shows,
  then step 1's **Do it by hand** is open.
- Given GitHub is down,
  when the request shows,
  then it says "GitHub isn't answering right now, so the steps may fail. You can do them all by hand below." and only **Do it all by hand** is open.
- Given step 2 has a check,
  when the user presses its **Mark done by hand**,
  then the check runs.
- Given step 3 has no check and was marked done by hand,
  when the request shows,
  then step 3 says "Done by hand, not checked".
