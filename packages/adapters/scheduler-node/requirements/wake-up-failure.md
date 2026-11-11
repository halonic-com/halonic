# scheduler-node.wake-up-failure

- Status: active
- Since: 0.1.0
- Source: HAL-5164, from Liam's review of `halonic routines watch` (HAL-5160): a caller that counts failed wake-ups must hear the ones that worked, and a failed wake-up must not leave the scheduler asleep

When a wake-up fails, the Node scheduler shall report it as a `"wake-up"` error and set its next wake-up for the next due timer or tick, but not sooner than a timer's retry would wait: 1 second after the first failure in a row, doubling up to at most 15 minutes. After each wake-up that delivered what was due without an error, it shall call the `onWokeUp` it was given, and the next failure shall wait 1 second again.

## Examples

- Given a scheduler whose wake-up for the tick fails,
  when it fails,
  then the scheduler reports a `"wake-up"` error and asks to be woken again in 1 second.
- Given that failed wake-up,
  when the next wake-up delivers what was due,
  then the scheduler calls `onWokeUp`.
