# kit.agent-tint

- Status: active
- Since: unreleased
- Source: the board's rule "each agent keeps one colour everywhere" (HAL-19132, HAL-19134); Sofia's Studio and Messenger alignment proposal on HAL-19755 (26 Nov), point 3; built on HAL-19763

The kit's `agentTint` shall give each key, an agent's ID or a person's name, one of the six agent tints (sky, teal, green, sand, coral and indigo) picked from the key alone, so the same key gets the same tint every time and in every app, and different keys spread over all six.

## Examples

- Given the agent ID "agent-chief",
  when `agentTint` is asked twice,
  then it gives the same tint both times.
- Given sixty different agent IDs,
  when `agentTint` is asked for each,
  then all six tints are used.
