# cloudflare-durable.routines-tick

- Status: active
- Since: 0.1.0
- Source: HAL-6797; build plan part 7 (HAL-197); multi-cloud ADR 5.3; design review HAL-6790 (Elena, 12 Nov); `Scheduler` port v1

The Cloudflare routines object shall be the one owner of the routine tick: it passes each tick to the listener one at a time, and a tick that arrives while another runs shall share that tick and start no second one. A tick that rejects shall reject to its caller and not be retried. After every tick, whether it worked or not, the object shall set a backup alarm a few minutes ahead, which each later tick moves on. When that alarm fires because the cron has stopped, the object shall tick at the clock's time and set the alarm again, and a failed backup tick shall not be thrown, so the platform never retries it.

## Examples

- Given a cron that ticks every minute,
  when each tick ends,
  then the backup alarm is 3 minutes after that tick, and never fires.
- Given two ticks that arrive together,
  when the first is still running,
  then the listener is called once and both callers get its outcome.
- Given a cron that has stopped for 3 minutes,
  when the backup alarm fires,
  then the listener gets a tick at the clock's time and the alarm is set 3 minutes ahead again.
- Given a listener that rejects,
  when the cron's tick runs,
  then the caller sees the rejection and the backup alarm is still set.
