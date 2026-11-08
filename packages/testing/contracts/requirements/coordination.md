# contracts.coordination

- Status: active
- Since: 0.1.0
- Source: HAL-114; plan 4.3; `Coordination` port v1; multi-cloud ADR 5.3

Where an adapter implements `Coordination`, it shall give a lease to one holder at a time (the caller included) until its expiry time, when it ends; renew a lease still held to `ttlMs` from now with the same token; and do nothing for a holder whose lease ran out, was released or was taken over. It shall set a value only while it still equals `expected` (`null`: not set), delete it when `next` is `null`, and take values up to 64 KiB of UTF-8. It shall add to a counter from 0 unless the result would pass `limit`, and count attempts in a fixed window that starts with its first attempt and ends at `start + windowMs`. Parallel increments and attempts shall never pass the limit. Leases, values, counters and windows shall keep the same key apart. When a key is empty or over 256 UTF-8 bytes, a value is over 64 KiB, or `ttlMs`, `windowMs`, `limit` or `by` isn't a positive safe whole number, the call shall reject with a `RangeError` and change nothing.

## Examples

- Given a lease taken for 10 seconds,
  when 9.999 seconds pass,
  then nobody can take it, and at 10 seconds anyone can.
- Given a lease that ran out and was taken by someone else,
  when the old holder renews or releases it,
  then renew gives `null` and the new holder keeps the lease.
- Given a counter at 5,
  when 3 is added with limit 7,
  then it gives `{ applied: false, value: 5 }`, and adding 2 gives `{ applied: true, value: 7 }`.
- Given a window of 1000 ms with limit 2 that started at T,
  when a third attempt comes at T + 999 ms,
  then it gives `{ allowed: false, count: 2, resetAt: T + 1000 }`, and an attempt at T + 1000 ms opens a new window.
- Given 10 parallel increments of 1 with limit 5,
  when they all finish,
  then exactly 5 were applied.
- Given `increment("budget", 1.5)`,
  when it is called,
  then it rejects with a `RangeError` and the counter is unchanged.
