# scheduler-node.closed

- Status: active
- Since: 0.1.0
- Source: HAL-9328, from Liam's review of #2665 (HAL-9327): a call made after `close` must not write to the store

The Node scheduler shall, once `close` has been called, reject `schedule` and `cancel` with an error saying the scheduler is closed, and shall write nothing to the store for them. Changes already accepted before `close` still settle first.

## Examples

- Given a closed scheduler,
  when a timer is scheduled,
  then the call rejects and nothing is written to the store.
- Given a closed scheduler and a timer that was pending,
  when it is cancelled,
  then the call rejects and the timer stays in the store.
