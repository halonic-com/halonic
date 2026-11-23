# paperclip.seats-scenarios

- Status: active
- Since: unreleased
- Source: HAL-16026; the seat usage forecast on HAL-15997 (document `seat-forecast`, section 4.3), part of the `seats` plugin (HAL-16008)

When the `seats.forecast` job runs, the seats forecast shall make one seat and pool forecast for the scenario `current` (today's caps, models and demand) and then one for each scenario in the plugin's settings, in their order, from the same seats, readings, placements and fits; a scenario shall change only the agents' demand: it shall multiply every agent's demand by its demand factor, run each agent it names on the model it names, and scale an agent whose cap it changes by the runs the agent could start with the new cap over the runs it can start now (each limited by the agent's running plus queued runs), leaving an agent with no cap as it is. Each forecast shall carry the time it was made, its scenario and the newest fit day it priced with.

## Examples

- Given a made-up agent with a cap of 3 and 4 runs running or queued,
  when a scenario lowers its cap by 1,
  then it keeps 2/3 of its demand.
- Given the same agent with only 1 run running and none queued,
  when the scenario lowers its cap by 1,
  then it keeps all of its demand.
- Given a scenario with a demand factor of 0.8,
  when it is forecast,
  then every agent's demand, and the points it adds to its seat, is 0.8 of today's.
- Given a scenario that runs an agent on a cheaper model,
  when it is forecast,
  then the agent's tokens are priced with that model's fit, and with no fit it is listed as uncalibrated.

## Limits

- A cap cut assumes the runs left keep the same size; the agent's work then waits in its queue rather than going away.
- A model switch keeps the agent's token count and mix; a different model may use a different number of tokens for the same work.
