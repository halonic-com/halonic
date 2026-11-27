# kit.settle-together

- Status: active
- Since: unreleased
- Source: HAL-19496 (Sofia's team decision G2 in HAL-20218's UX acceptance rows: cards that end in the same read hold and leave together, in one motion); plan approved by Liam

The kit shall offer `useSettleAwayTogether`, which holds several settling elements as one, as `useSettleAway` holds one (`kit.settle`): for 4 seconds, pausing while the pointer is over any of them or the focus is in one, also as the pointer moves from one to the next, and going on for what was left once both leave. Then it shall play the settle motion on every one of them at once, with nothing in them taking the focus while they go, and say they are gone once. If none of them shows, the hook shall say they are gone at once.

## Examples

- Given three elements held together,
  when 4 seconds pass,
  then the settle motion plays on all three, and they are said gone once.
- Given three elements held together, with the pointer over the first from the first second, then moving to the second,
  when the pointer leaves the second 10 seconds later,
  then they go 3 seconds after that.
- Given three elements held together, with the focus in the third,
  when 12 seconds pass,
  then they are still there, and they go 4 seconds after the focus leaves.
- Given cards held together, none of which shows,
  when the hold starts,
  then they are said gone at once.
