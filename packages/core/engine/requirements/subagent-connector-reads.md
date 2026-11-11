# engine.subagent-connector-reads

- Status: active
- Since: 0.1.0
- Source: HAL-3361 (FamilyOffice parity: the old engine gave a delegated agent its connectors' tools, except the ones under `approve`; subagents wait for an OK and for the effect step since PR 4, design reviewed on HAL-4700); plan row E5 on HAL-9

Where the executor is given connector calls, when a subagent's turn runs in a workflow run, the engine shall offer it the tools of the connectors its own file lists that their files in the run's kept definitions allow, and check its calls, as for the state's agent: a call under its connector's `approve` list, or that `checkToolCall` asks about, waits for a person's OK, and a call that can change things stops the run for the engine to record and make it (`engine.run-connector-approve`, `engine.run-connector-calls`, `engine.turn-subagent-stop`). Under a `parallel` branch, at any depth, the engine shall keep only the tools that count as reading and that no `approve` list names, as for the branch (`engine.parallel-connector-approve`), which leaves only the tools the `read` list of their connector's file names, because a listing can't make its tool count as reading (`engine.parallel-state`). What the subagent is offered shall follow its own file only, not the delegating agent's. When a person approves the subagent's call, the engine shall make it and give its result to the subagent's model. Where the executor isn't given connector calls, the engine shall offer a subagent no connector tools.

## Examples

- Given a `writer` that delegates to a `checker` whose file lists `mail`, a connector `mail` that lists `search` and `list_folders` (both `read`), `archive` (`write`), `send_mail` (`send`) and `label` (no risk), and `mail`'s file puts `list_folders` under `approve`,
  when the `checker`'s turn runs,
  then its model is offered all five, and the `writer`'s model, whose file lists no connector, none of `mail`'s tools.
- Given that run, but the `writer` is the agent of a `parallel` branch,
  when the `checker`'s turn runs,
  then its model is offered none of `mail`'s tools.
- Given that run, when the `checker` calls `search`,
  then the run waits for a person's OK, and once approved `mail` gets the call and the `checker`'s model gets its result.
- Given that run, when the `checker` calls `archive`,
  then the run waits for a person's OK with `subagent: checker`, and once approved records `effect.requested` naming `checker`, makes the call once and the `checker`'s model gets its result.
- Given that run, when the `checker` calls `list_folders`,
  then the run waits for a person's OK, and `mail` gets the call only after it.
- Given a `writer` whose file lists `mail` and a `checker` whose file lists none,
  when the `checker` calls `archive`,
  then its model gets a refusal, and `mail` gets no call.
- Given that run without connector calls,
  when the `checker`'s turn runs,
  then its model is offered none of `mail`'s tools.
