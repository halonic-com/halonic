# std.keyed-queue

- Status: active
- Since: 0.1.0
- Source: HAL-1635; the folder run store appends to each run's log one call at a time

When work is queued for a key, `KeyedQueue` shall start it only after the work queued before it for the same key has settled, and shall run work for different keys side by side. If work fails, then the queue shall give the failure to that work's caller and still run the work queued after it. Once a key has no work left, the queue shall forget it.

## Examples

- Given work "a" still running for `run-1`, when work "b" is queued for `run-1`, then "b" starts only after "a" ends.
- Given work still running for `run-1`, when work is queued for `run-2`, then it runs at once.
- Given work for `run-1` that throws "disk full" and work queued after it, when both run, then the first caller gets "disk full" and the second work still runs.
- Given work for `run-1`, when it has ended, then `busyKeys` is 0.
