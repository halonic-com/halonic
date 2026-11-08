# adapter-scheduler-node.wake-up

- Status: active
- Since: 0.1.0
- Source: HAL-619; plan 4.4; root `AGENTS.md` ("fake timers instead of sleeps")

The Node scheduler shall wake itself with the timer function it was given, set for the earlier of the next due timer and the next tick, so nothing has to call it. After `close`, it shall set no more wake-ups and deliver nothing more, and `close` shall resolve once the deliveries in progress have settled.

## Examples

- Given a timer set for 5 seconds from now,
  when it is set,
  then the scheduler asks the timer function to wake it in 5 seconds.
- Given no timers,
  when the scheduler starts,
  then it asks to be woken in 1 minute, for the tick.
- Given a closed scheduler and a due timer,
  when its last wake-up fires,
  then nothing is delivered.
