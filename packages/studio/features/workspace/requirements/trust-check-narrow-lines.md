# workspace.trust-check-narrow-lines

- Status: active
- Since: unreleased
- Source: HAL-16420 (C706 row 2): in a 390 px window a program's values got about 50 px beside "Takes from your environment" (mockup-trust section 1.1, microcopy 4.3)

When a trust check row is narrower than 24rem, the check shall show each line's label over its value, so a value gets the row's full width. When the row is 24rem or wider, it shall keep the labels in one column and the values in the next.

## Examples

- Given a program row with **Takes from your environment** `PATH` and **Runs** `/usr/local/bin/node`,
  and a window 390 px wide,
  when the person opens the check,
  then "Runs:" stands on its own line with `/usr/local/bin/node` under it.
