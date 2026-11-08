# memory.coordination

- Status: active
- Since: 0.1.0
- Source: HAL-114; `Coordination` port v1

The memory coordination shall read the time from the clock it was given, so a test can make a lease or window run out by moving that clock, and shall give lease tokens that are unique within one instance.

## Examples

- Given a memory coordination on a manual clock and a lease for 10 seconds,
  when the clock moves 10 seconds,
  then the lease can be taken again, with a new token.
