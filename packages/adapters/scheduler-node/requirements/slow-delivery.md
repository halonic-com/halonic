# scheduler-node.slow-delivery

- Status: active
- Since: 0.1.0
- Source: HAL-5207; plan 4.4

While a listener call or a tick is still running, the Node scheduler shall keep its wake-up set for the next due timer or tick, so one slow call holds back no other timer. When the tick is still running at the time of the next one, the scheduler shall not wake for it until the running tick settles, and shall then start the next tick at once.

## Examples

- Given a timer whose listener call hasn't settled and a second timer due 4 seconds later,
  when those 4 seconds pass,
  then the second timer is delivered without waiting for the first call.
- Given a timer that failed while another timer's call is still running,
  when its 1-second retry is due,
  then it is delivered again.
- Given a tick that is still running 2 minutes after it started,
  when it settles,
  then the scheduler starts the next tick at once, and woke for nothing while it ran.
