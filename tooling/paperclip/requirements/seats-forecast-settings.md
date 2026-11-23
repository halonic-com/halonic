# paperclip.seats-forecast-settings

- Status: active
- Since: unreleased
- Source: HAL-16692; the seat usage forecast on HAL-15997 (document `seat-forecast`, sections 4.3 and 9: which agents a scenario names comes from settings, never from code)

When the `seats` plugin reads its settings, it shall start with no per-model weekly windows and no forecast scenarios until the board sets them; it shall keep a model window only with a model id prefix and a window name, and a scenario only with a valid id that is not `current` and not already taken, and that changes something: a cap change in whole runs or a model for the agents it names, or a demand factor above 0 and at most 2 other than 1. A scenario shall give each agent it names its cap change and its model. It shall count every model window and scenario it leaves out, and every scenario it keeps without a cap change, model or demand factor that was set.

## Examples

- Given the plugin as installed,
  when nobody has changed its settings,
  then it has no model windows and no scenarios.
- Given a scenario naming two made-up agents with a cap change of -1,
  when the plugin reads it,
  then each of the two agents has a cap change of -1 and no other agent changes.
- Given a scenario named `current`, a second scenario with an id already taken, a scenario with a cap change but no agents and one with a demand factor of 3,
  when the plugin reads them,
  then it leaves all four out.

## Limits

- A scenario gives every agent it names the same cap change and the same model; two different changes need two scenarios.
