# scheduler-node.store-failure

- Status: active
- Since: 0.1.0
- Source: HAL-5615, from Liam's review of HAL-5207 (PR #1803): a store that fails while a delivery is recorded must not make the scheduler deliver again at once, in a loop

When the store fails while the Node scheduler records how a delivery went (the removal of a delivered timer, or the retry of one the listener rejected), the scheduler shall report the error with the timer as its source and deliver the timer again after a timer's retry wait: 1 second after the first failure in a row, doubling up to at most 15 minutes. It shall not wake up again at once for that timer.

## Examples

- Given a timer whose listener resolves and a store that fails every write,
  when the timer is delivered,
  then the scheduler reports the store's error and wakes again in 1 second, then 2, not at once.
- Given that store working again,
  when the timer is next delivered,
  then it is removed and no longer pending.
- Given a listener that rejects and a store that fails every write,
  when the timer is delivered,
  then the scheduler reports both errors and wakes again in 1 second, not at once.
