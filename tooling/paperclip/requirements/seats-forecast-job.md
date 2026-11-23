# paperclip.seats-forecast-job

- Status: active
- Since: unreleased
- Source: HAL-16692; wiring the seat forecast (HAL-16026) into the `seats` plugin (HAL-16008); the seat usage forecast on HAL-15997 (document `seat-forecast`, sections 4.3, 4.5 and 5: plugin state holds only the latest values)

While the `seats` plugin runs, `seats.forecast` shall every 10 minutes, for the one company whose settings list the seats, load the seats' newest readings, the open placements, each agent's newest activity and its last 14 days of usage, and the fits of the last 8 days; forecast the seats and the pool under `current` and each scenario in the settings; store the forecast points of `current` only, since a scenario never happens; remove forecast points made more than 7 days before; keep the newest runs of every scenario in the plugin's state; and log how many seat windows, scenarios and stored points there were, how many agents had no fit for a window, how many settings entries were left out or corrected, and the pool's run-out, with no seat folder, account, connection id or agent name. It shall propose and change nothing.

## Examples

- Given a made-up seat with one agent on it, fits for its model and a scenario that halves every agent's demand,
  when `seats.forecast` runs,
  then it stores 3 points (1, 5 and 24 hours ahead) for each of the seat's 2 windows, keeps the runs of `current` and the scenario, and the scenario's seat ends its 5-hour window lower than `current`'s.
- Given the same seat with no fit for the agent's model,
  when `seats.forecast` runs,
  then it still stores the seat's points, and its log counts 1 agent without a fit.
- Given a scenario that names an agent and sets a demand factor of 3, and one named `current`,
  when `seats.forecast` runs,
  then it forecasts the first with a factor of 1, leaves out the second, and its log counts 2 settings entries left out or corrected.
- Given no company whose settings list seats,
  when `seats.forecast` runs,
  then it reads and stores nothing.

## Limits

- An agent that `seats.history` hasn't seen for an hour is left out of the forecast.
