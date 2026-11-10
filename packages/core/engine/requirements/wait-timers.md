# engine.wait-timers

- Status: active
- Since: 0.1.0
- Source: HAL-1528, step 3(c) of the HAL-186 plan

When a timer of a waiting run arrives, the engine shall take, of the state's timers that are due, the one due first whose guard passes, and record `timer.fired` and a transition with the event `after <delay>`. A timer set on an earlier visit to the state shall change nothing. A timer that arrives before it is due shall change nothing and be set again for its due time.

## Examples

- Given a run that entered a `decide` wait state with an `after: 2d` timer at 09:00 on 9 November,
  when its timer arrives at 09:00 on 11 November,
  then the engine records `timer.fired` with `2d` and moves on `after 2d` to `expired`.
- Given the same run,
  when its timer arrives at 09:00 on 10 November,
  then nothing is recorded and the timer is set again for 09:00 on 11 November.
- Given a run that left the `decide` state and entered it again,
  when a timer set on the first visit arrives,
  then nothing is recorded.
