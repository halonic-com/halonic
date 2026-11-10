# routines.skipped-times

- Status: active
- Since: 0.1.0
- Source: HAL-642 (skip records), HAL-540 (`trigger.catchUp`), HAL-2542 and HAL-2524 (reasons, ranges, counts); Studio shows "Skipped at 06:00, the computer was asleep" and "Caught up after sleep"

When asked which routines are due for a tick together with what it drops, the routines package shall return the same runs as `routines.due`, and for each routine every due time in the window after the last tick up to and including now that it doesn't return, as ranges of oldest time, newest time, count and reason. With `catchUp: "none"` every dropped time shall have reason `missed`, also when it is older than the catch-up window. With `last` or `all`, a time older than the catch-up window shall have reason `window`, a time `all` drops past the catch-up cap reason `cap`, and a time `last` drops for a newer one reason `latest`; each dropped time shall have one reason. Counting a cron's dropped times shall stop at 10,000 and then mark the count as a minimum; an interval's count shall be exact. The oldest returned run of a routine that is more than the grace period late shall carry `catchUp` with the number of the routine's dropped times, or 10,000 marked as a minimum when a count stopped at its limit, and each later late run of the routine `catchUp` with 0. A run within the grace period shall carry no `catchUp`. Disabled routines and routines whose trigger doesn't parse shall get neither runs nor ranges.

## Examples

- Given an hourly routine with `catchUp: "last"`, a last tick at Fri 6 Nov 18:00 and now Mon 9 Nov 08:12,
  when the tick runs,
  then 08:00 Mon is due with `catchUp: { skipped: 61 }`, and 19:00 Fri to 07:00 Mon is one `latest` range of 61.
- Given the same routine with `catchUp: "none"`,
  when the tick runs,
  then nothing is due, and 19:00 Fri to 08:00 Mon is one `missed` range of 62.
- Given the same routine with `catchUp: "all"`, a last tick at Sun 25 Oct 18:00 and now Mon 9 Nov 08:12,
  when the tick runs,
  then the newest 100 times are due, the oldest with `catchUp: { skipped: 250 }` and the rest with 0, and the ranges are 19:00 Sun 25 Oct to 08:00 Mon 2 Nov (`window`) 182 times, and 09:00 Mon 2 Nov to 04:00 Thu 5 Nov (`cap`), 68 times.
- Given a weekday routine at 07:30 with `catchUp: "last"`, a last tick at Fri 6 Nov 18:00 and now Mon 9 Nov 08:12,
  when the tick runs,
  then 07:30 Mon is due with `catchUp: { skipped: 0 }` and there are no ranges.
- Given a routine due at 08:00 and now 08:00:30,
  when the tick runs,
  then 08:00 is due without `catchUp`.
- Given a cron that fires every minute from 00:00 to 22:59 with `catchUp: "last"`, a last tick at 1 Oct 00:00 and now 9 Nov 23:30,
  when the tick runs,
  then 22:59 is due with `catchUp: { skipped: 10000, countIsMinimum: true }`, the `window` range has a count of 10,000 marked as a minimum, and the `latest` range an exact count of 9,659.
