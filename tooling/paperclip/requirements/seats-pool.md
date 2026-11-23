# paperclip.seats-pool

- Status: active
- Since: unreleased
- Source: HAL-16026; the seat usage forecast on HAL-15997 (document `seat-forecast`, sections 1 and 4.3), part of the `seats` plugin (HAL-16008)

When the `seats.forecast` job forecasts the pool, the seats forecast shall add up the weekly points left on every active pool or reserve seat with a weekly reading (a point is 1% of one seat's weekly window), walk them forward for 14 days in steps that end on each whole hour and each seat's weekly reset, spend each step's P50 and P90 weekly demand of the agents on those seats (priced as in the seat forecast) from the seat that resets soonest first, and give each seat back 100 points at its weekly reset; it shall give the points left now, the run-out time when no points are left (P50 and P90) and the days until then, nothing for a run-out beyond 14 days, the points and tokens a day at this hour's demand, the sustainable rate of 100 points per seat a week, and that rate in tokens at this hour's tokens per point. Paid-API seats shall not count, and only agents on the seats in the pool shall spend from it. When no seat has a weekly reading, it shall give no run-out time.

## Examples

- Given two made-up seats with 10 and 50 weekly points left, resetting in 2 and about 4 days, and agents costing 3 points an hour (6 when busy),
  when the pool is forecast,
  then 60 points are left, and it runs out in 20 hours (P90 10 hours).
- Given the first seat resets in 5 hours instead,
  when the pool is forecast,
  then it runs out 5 + 145 / 3 hours from now, because the reset puts 100 points back.
- Given agents costing 1 point an hour against a sustainable 200 / 7 a day,
  when the pool is forecast,
  then it doesn't run out within 14 days at P50.
- Given every seat at 100%,
  when the pool is forecast,
  then it has run out now.
- Given no seat has a weekly reading yet,
  when the pool is forecast,
  then it gives no run-out time, rather than saying it has run out.

## Limits

- The pool is shared as the Supervisor shares it, soonest reset first; a seat whose points can't be reached because no agent may use it still counts.
- P90 adds every agent's busy rate at once, as in the seat forecast, so it is the cautious side.
- It starts from each seat's latest weekly reading but walks from `now`, so what the agents use between that reading and `now` (normally at most one read interval) isn't spent.
