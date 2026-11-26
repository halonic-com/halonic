# runs.agent-tint

- Status: active
- Since: unreleased
- Source: the Messenger change approved on HAL-19141, point 3 (each agent keeps one colour everywhere); Sofia's Studio and Messenger alignment proposal on HAL-19755 (26 Nov), PR 3; built on HAL-19765

Where the Runs app's list shows an agent's run and the team knows the agent, the run's tile shall show the agent's initials on its own tint, the one its Messenger bubbles have. Where the team doesn't know the agent, the tile shall stay neutral.

## Examples

- Given a run by the known agent Ada,
  when the list shows,
  then its tile has Ada's tint.
- Given a run by an agent the team doesn't know,
  when the list shows,
  then its tile is neutral.
