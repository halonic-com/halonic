# adapter-scheduler-node.delivery

- Status: active
- Since: 0.1.0
- Source: HAL-619; plan 3.4 and 4.4 ("Node timers and leases"); `Scheduler` port v1

The Node scheduler shall deliver a timer once the clock it was given reaches the timer's time, with the time it was set for, and remove it when the listener resolves. It shall treat a time in the past as due at once and move a timer that is set again. When the listener rejects, it shall keep the timer and deliver it again 1 second later, doubling the wait after each failure up to at most 15 minutes. A timer the listener sets again or cancels during the call shall stay as the listener left it. It shall call the listener's tick about once a minute, and a tick that rejects shall stop nothing. When a key or timer id is longer than 256 UTF-8 bytes, or the time isn't a valid time, `schedule` shall reject with a `RangeError` and change nothing.

## Examples

- Given a timer set for 5 seconds from now,
  when the clock moves 4 seconds,
  then nothing is delivered, and after 1 more second it is delivered and no longer pending.
- Given a listener that rejects every call,
  when the timer has failed 11 times,
  then the next try comes 15 minutes later, not 17.
- Given a listener that sets the timer again for 10 minutes later and then rejects,
  when 1 second passes,
  then nothing is delivered and the timer is pending for 10 minutes later.
- Given `schedule("run_1", "wait", "soon")`,
  when it is called,
  then it rejects with a `RangeError` and no change is stored.
