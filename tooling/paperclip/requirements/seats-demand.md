# paperclip.seats-demand

- Status: active
- Since: unreleased
- Source: HAL-16026; the seat usage forecast on HAL-15997 (document `seat-forecast`, sections 3 and 4.3), part of the `seats` plugin (HAL-16008)

When the `seats.forecast` job forecasts an agent's demand for an hour, the seats forecast shall give a typical (P50) and busy (P90) token count that blends the agent's current rate, which is its last 2 hours or, when it has no running or queued run and no open task, its idle rate (the 10th percentile of its hours), with its usual rate for that hour of the week from its own last 14 days, moving from the first to the second as the hour gets further ahead; P90 shall be P50 times how far the agent's busy hours have run above its usual ones, and the agent's token mix and current model shall be kept to turn tokens into points.

## Examples

- Given a made-up agent working 09:00–17:00 UTC at 6 M tokens an hour and 0.1 M otherwise, with a run going at 12:00,
  when its next hour is forecast,
  then the P50 is 6 M.
- Given the same agent,
  when 02:00 the next night is forecast,
  then the P50 is under 0.4 M, and 10:00 the next morning is over 5 M.
- Given the same agent with no run and no open task,
  when its next hour is forecast,
  then it is its idle rate of 0.1 M.
- Given an agent using exactly 1 M tokens every hour,
  when its spread is measured,
  then P90 equals P50.
- Given an agent with no history,
  when it is forecast,
  then its demand is 0 and its spread the default of 2.
