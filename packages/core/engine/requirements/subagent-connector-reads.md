# engine.subagent-connector-reads

- Status: active
- Since: 0.1.0
- Source: HAL-3361 (FamilyOffice parity: the old engine gave a delegated agent its connectors' tools, except the ones under `approve`)

Where the executor is given connector calls, when a subagent's turn runs in a workflow run, the engine shall offer it the tools of the connectors its own file lists that their files in the run's kept definitions allow, keeping only the tools whose listing says they read and leaving out every tool that its connector's `approve` list names or that a connector whose list is `all` has, as for a `parallel` branch. When the subagent calls one of them, the engine shall make the call and give its result to the subagent's model. Where the executor isn't given connector calls, the engine shall offer a subagent no connector tools.

## Examples

- Given a `writer` that delegates to a `checker` whose file lists `mail`, a connector `mail` that lists `search` and `list_folders` (both `read`), `archive` (`write`), `send_mail` (`send`) and `label` (no risk), and `mail`'s file puts `list_folders` under `approve`,
  when the `checker`'s turn runs,
  then its model is offered `search` only, and the `writer`'s model, whose file lists no connector, none of `mail`'s tools.
- Given that run, when the `checker` calls `search`,
  then `mail` gets the call and the `checker`'s model gets its result.
- Given that run without connector calls,
  when the `checker`'s turn runs,
  then its model is offered none of `mail`'s tools.
