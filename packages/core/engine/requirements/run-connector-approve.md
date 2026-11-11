# engine.run-connector-approve

- Status: active
- Since: 0.1.0
- Source: HAL-4554 (found on HAL-4481: a run asked a person by a tool's risk only, not by its connector file's `approve`)

When a run's model, or a subagent's model in a run (`engine.subagent-connector-reads`), calls a connector's tool that the `approve` list of that connector's file in the run's kept definitions names, under the name its server lists it under, or when that list is `all`, the engine shall wait for a person's OK before it makes the call, whatever risk the server lists the tool with.

## Examples

- Given a run whose agent lists `mail`, and `mail`'s file puts `search` under `approve` while its server lists `search` as `read`,
  when the agent's model calls `search`,
  then the run waits for a person's OK, and the call reaches `mail` only after the OK.
- Given a run whose agent lists `mail`, and `mail`'s file says `approve: all`,
  when the agent's model calls any of `mail`'s tools,
  then the run waits for a person's OK before the call reaches `mail`.
