# engine.foreach-connector-tools

- Status: active
- Since: 0.1.0
- Source: HAL-5214, findings of the 11 Nov code review

Where the executor is given connector calls, when the engine asks for a `foreach` item's model call, a model call in the child run of an item that runs a workflow or in any run below it, or a subagent's under one, it shall offer only the connector tools a `parallel` branch is offered (`engine.parallel-state`, `engine.parallel-connector-approve`): an item's agent can't wait for a person or make a call that changes things, so it never sees a tool that could only fail the run.

## Examples

- Given a run with a `foreach` state whose agent lists `mail`, and a connector `mail` that lists `search` (`read`) and `send_mail` (`send`),
  when the engine asks for each item's model call,
  then no call offers any of `mail`'s tools, and the run completes with the items' answers.
- Given the same connector, and a `foreach` state whose items each run a workflow whose agent lists `mail`,
  when the engine asks for the model call in each item's child run,
  then no call offers any of `mail`'s tools, and the run completes with the items' answers.
