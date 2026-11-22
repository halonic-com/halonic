# paperclip.seats-seat-forecast

- Status: active
- Since: unreleased
- Source: HAL-16026; the seat usage forecast on HAL-15997 (document `seat-forecast`, section 4.3), part of the `seats` plugin (HAL-16008)

When the `seats.forecast` job forecasts the seats, the seats forecast shall walk each window of each active pool or reserve seat forward hour by hour from its latest reading, adding the points of the agents placed on it in each hour (each agent's P50 and P90 demand priced at the newest fit for the seat's plan, the agent's model and the window, with a per-model weekly window counting only the models settings map to it), capped at 100% and starting again from 0 at each reset; it shall give the used % at the next reset, the times it reaches 80, 90 and 100% before that reset, the used % 1, 5 and 24 hours ahead, every reset of the next 7 days with the points it gives back, each agent's demand now with its seat, and the agents that add no points because their model has no fit. Paid-API seats shall get no forecast.

## Examples

- Given a made-up seat at 40% of its 5-hour window, resetting in 3 hours, with one agent costing 10 points an hour (20 when busy),
  when it is forecast,
  then it is at 70% at the reset (P90 100%), and its P90 reaches 80% in 2 hours.
- Given the same seat,
  when the forecast points are made,
  then they are 50% after 1 hour, 20% after 5 hours (past the reset) and 10% after 24 hours.
- Given the same seat,
  when capacity coming free is listed,
  then it gives back 70 points in 3 hours and 50 points in 8 hours, and so on every 5 hours for 7 days.
- Given the agent planned to move to an empty seat in 1 hour,
  when both seats are forecast,
  then the first is at 50% at its reset and the second at 20%.
- Given an agent whose model has no fit,
  when its seat is forecast,
  then it adds no points and is listed as uncalibrated.
