# workspace.trust-check-narrow-lines

- Status: active
- Since: unreleased
- Source: HAL-16420 (C706 row 2): in a 390 px window a program's values got about 50 px beside "Takes from your environment" (mockup-trust section 1.1, microcopy 4.3); HAL-16516 (C716 row 3): below 24rem the pairs ran together, 0 px from a value to the next label

When a trust check row is narrower than 24rem, the check shall show each line's label over its value, so a value gets the row's full width, with more space between a value and the next line's label than between a label and its own value. When the row is 24rem or wider, it shall keep the labels in one column and the values in the next.

## Examples

- Given a program row with **Takes from your environment** `PATH` and **Runs** `/usr/local/bin/node`,
  and a window 390 px wide,
  when the person opens the check,
  then "Runs:" stands on its own line with `/usr/local/bin/node` directly under it,
  and 8 px above the next label.
