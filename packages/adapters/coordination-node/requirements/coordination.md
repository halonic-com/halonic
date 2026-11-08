# adapter-coordination-node.coordination

- Status: active
- Since: 0.1.0
- Source: HAL-619; plan 3.4 and 4.4 ("Node timers and leases"); `Coordination` port v1

The Node coordination adapter shall give a lease to one holder at a time until its expiry time by the clock it was given, renew or release it only for the token that holds it, set a value only while it is still what the caller expects, add to a counter only while the result stays within the limit (or within `Number.MAX_SAFE_INTEGER` when there is no limit), answering `applied: false` otherwise, and count attempts in a fixed window that starts with its first attempt, never letting parallel calls past a limit. When a key isn't 1 to 256 UTF-8 bytes, a value is over 64 KiB of UTF-8, or `ttlMs`, `windowMs`, `limit` or `by` isn't a positive safe whole number, it shall reject with a `RangeError` and change nothing.

## Examples

- Given a lease taken for 10 seconds,
  when 9.999 seconds pass,
  then nobody can take it, and after 1 more millisecond someone can.
- Given ten parallel `increment("budget", 1, 5)` calls,
  when they settle,
  then five were applied and the counter is 5.
- Given `increment("budget", 1.5)`,
  when it is called,
  then it rejects with a `RangeError` and the counter is unchanged.
- Given a counter at `Number.MAX_SAFE_INTEGER`,
  when `increment("total", 1)` is called without a limit,
  then it answers `applied: false` and the counter is unchanged.
