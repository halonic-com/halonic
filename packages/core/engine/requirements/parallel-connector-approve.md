# engine.parallel-connector-approve

- Status: active
- Since: 0.1.0
- Source: HAL-4630 (found in the review of HAL-4554: a `parallel` branch was still offered a read tool that waits for a person, and calling it ended the branch)

Where the executor is given connector calls, when the engine asks for a `parallel` branch's model call, it shall leave out of the connector tools offered every tool that the `approve` list of its connector's file in the run's kept definitions names, under the name its server lists it under, and every tool of a connector whose list is `all`, whatever risk the server lists the tool with.

## Examples

- Given a run with a `parallel` state of two branches whose agents list `mail`, a connector `mail` that lists `search` and `list_folders` (both `read`), and `mail`'s file puts `search` under `approve`,
  when the engine asks for each branch's model call,
  then each call offers `list_folders` and not `search`.
- Given that run, and `mail`'s file says `approve: all` instead,
  when the engine asks for each branch's model call,
  then neither call offers any of `mail`'s tools.
