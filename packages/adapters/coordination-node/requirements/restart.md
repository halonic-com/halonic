# coordination-node.restart

- Status: active
- Since: 0.1.0
- Source: HAL-619, HAL-797; plan 4.4; `Coordination` port v1 ("a lease is never held across a crash for good")

The Node coordination adapter shall keep every lease, value, counter and window as records in the `RecordStore` it was given, writing each change before it answers, and a new adapter on the same store and collection shall go on from that state: a lease stays held until it runs out, and counters and windows keep their counts. When the store fails a write, the call shall reject and change nothing. When a stored record isn't one this adapter wrote, every call shall reject with an error that names the record. When it starts, the adapter shall remove the leases that have run out and compact the collection, so released leases, deleted values and replaced entries leave the store; a collection with a record it didn't write shall stay as it is. When the store fails the clean-up, the adapter shall still start from the state it read.

## Examples

- Given a lease taken for 10 seconds before a restart,
  when a new adapter tries to take it 5 seconds later,
  then it gets `null`, and after 10 seconds it gets a lease with a new token.
- Given a counter at 4 before a restart,
  when a new adapter adds 1 with a limit of 4,
  then nothing is added and the value is 4.
- Given a store that fails the next write,
  when `increment("budget", 1)` is called,
  then it rejects, and the next call starts from the old value.
- Given a lease that ran out, a released lease, a deleted value and a counter changed three times,
  when a new adapter starts on the same store,
  then the collection holds one `seed` for the counter and nothing else.
- Given a lease that ran out and a counter at 3, and a store that fails the next compaction,
  when a new adapter starts and adds 1,
  then the value is 4 and the lease can be taken.
