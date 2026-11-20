# engine.run-connector-allow

- Status: active
- Since: 0.1.0
- Source: HAL-4481 (found on HAL-4457: the old engine offered an agent only its own connectors' allowed tools); the logged refusal from HAL-4658; the call step and its approval check from HAL-13288

Where a run's model call is offered a connector's tools, the engine shall offer only the tools the `allow` list of that connector's file in the run's kept definitions names, under the name its server lists them under, and every tool the server lists when the file has no `allow`. A connector whose file isn't in the run's kept definitions shall offer none of its tools, and a call the model makes to a tool that wasn't offered shall reach no connector, ask no person, record no effect, and write one `tool.refused` to the run log (`engine.turn-logs-events`). When the engine makes a call the turn asked for, it shall look the tool up among the same tools, so a tool the `allow` list leaves out is neither called nor checked for a person's approval, and no person is told it waits.

## Examples

- Given a run whose agent lists `mail`, and `mail`'s file allows only `search` while its server lists `search` and `delete_all`,
  when the engine makes the agent's model call,
  then the model is offered `search` only, and a call it makes to `delete_all` reaches no connector and writes one `tool.refused` naming `delete_all`.
- Given a run whose agent lists `mail`, and the run's kept definitions have no file for `mail`,
  when the engine makes the agent's model call,
  then the model is offered none of `mail`'s tools.
- Given a run whose agent lists `handbook-files`, whose file allows only `read_text_file`, which a person approved, while its server also lists `read_file` and `write_file`,
  when the engine makes the agent's call to `read_text_file`,
  then the call is made, and the host hears of no tool that waits for approval.
