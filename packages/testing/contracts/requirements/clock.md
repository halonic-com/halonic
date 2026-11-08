# contracts.clock

- Status: active
- Since: 0.1.0
- Source: HAL-114; plan 4.3; `Clock` port v1

Where an adapter implements `Clock`, it shall give a valid time that doesn't go backwards from one call to the next, as a new `Date` on every call, so a caller that changes the `Date` it got changes nothing else.

## Examples

- Given any clock,
  when `now()` is called twice,
  then the second time is the same as or later than the first.
- Given a `Date` from `now()` that the caller set to 1970,
  when `now()` is called again,
  then it gives a different object at the clock's time.
