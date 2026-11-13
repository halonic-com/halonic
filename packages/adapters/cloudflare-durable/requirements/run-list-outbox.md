# cloudflare-durable.run-list-outbox

- Status: active
- Since: 0.1.0
- Source: HAL-6796; build plan part 6 (HAL-197); design review HAL-6790 (Elena, 12 Nov); `RunStore` port v1 (the list may lag the log)

The Cloudflare run object shall note in an outbox, in the same transaction as each successful append, that the run list is behind its log, and shall send the run's summary to the run list from its alarm, never inside the append. A failed send shall be kept and tried again on the same alarm after 1 second, doubling, at most 15 minutes, sending the latest summary then. A note made while a send was in flight shall stay. The send shall be safe to repeat, and an older update arriving after a newer one shall change nothing (the run list's guard). The run's `get` shall come from its log, always current.

## Examples

- Given an append that succeeds,
  when the alarm fires,
  then the run list gets the run's summary once, and the alarm is removed.
- Given a run list that rejects the first send,
  when the alarm has been set again 1 second later and fires after one more append,
  then the run list gets the summary of the later event.
- Given an append that conflicts,
  when the alarm would fire,
  then nothing is sent.
