# cloudflare-durable.timers

- Status: active
- Since: 0.1.0
- Source: HAL-6796; build plan part 6 (HAL-197); design review HAL-6790 (Elena, 12 Nov); `Scheduler` port v1

The Cloudflare run object shall keep a key's timers in its SQLite storage with an attempt count and a version per timer, deliver a timer when it is due and never before, with the time it was set for, and deliver a timer that comes due while another timer's call is still running, although a Durable Object never runs two alarms at once. When the listener rejects, it shall deliver the timer again after 1 second, doubling the wait each time up to at most 15 minutes, and never drop it. A timer the listener sets again or cancels during its call shall stay as that left it, whether the call resolves or rejects. It shall keep the one alarm set to the earliest due time.

## Examples

- Given a timer whose call rejects 3 times,
  when each retry wait has passed,
  then it is delivered again after 1, 2 and 4 seconds, and not before.
- Given a timer whose call is still running,
  when another timer of the same key comes due,
  then the second is delivered without waiting for the first call to end.
- Given a timer that the listener moved to 10 minutes later during a call that then rejected,
  when the call ends,
  then the timer is pending for 10 minutes later and no retry wait replaces that.
