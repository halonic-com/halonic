# engine.run-connector-calls

- Status: active
- Since: 0.1.0
- Source: HAL-1532, step 4(c) of the [HAL-186 implementation plan](/HAL/issues/HAL-186#document-implementation-plan), "Allow sending per connection" and "Idempotency keys and unknown outcome"; Liam's notes on HAL-1532 (only `SendingSettings`, the store's error to the host)

Where the executor is given connector calls for runs, the engine shall offer in a run's model call the tools of the connected servers its agent's file lists under `connectors`, and none to an agent whose file lists none or that the run's definitions have no file for. Every call to a connector's tool counts as one that can change things, whatever risk its listing gives, because a server can't lower its tool's risk (`engine.run-tool-calls`). For a call to a tool labelled `send`, the engine shall ask `SendingSettings.checkSending` for the connector before it asks a person for an OK, and again after the OK, and if sending isn't allowed, shall give the model the reason as the call's result, as data, record no `effect.requested`, and make no call. When the settings can't be read, the engine shall pass the store's error to the host apart from the reason, and never to the model. Otherwise the engine shall record the call as `engine.connector-effects` says, and only then make it, with its idempotency key, within the time limit `connector.started` gave; each time it makes a call to a tool labelled `send`, a retry included, it shall check sending again, and if sending isn't allowed, shall not make the call and shall record `tool.result` with `outcome: "error"` and the reason; a call that fails or takes longer gets `outcome: "unknown"`, as `engine.unknown-outcome` says. When the engine starts, a run with a recorded call and no result shall get `outcome: "unknown"` and wait for `retry` or `skip`, and the call shall not be made again. Where the executor isn't given connector calls, a run's model call shall offer no connector's tools. The engine shall get only `SendingSettings`, never the settings' write side.

## Examples

- Given a run whose agent's file lists `mail` under `connectors`, and connected servers `mail` and `tracker`,
  when the engine makes the agent's model call,
  then the model is offered `mail`'s tools and none of `tracker`'s, and a call it makes to a `tracker` tool reaches no connector.
- Given a run whose agent calls `send_mail` on `mail`, labelled `send`, and sending is on,
  when a person approves the call,
  then the engine records `effect.requested`, `connector.started` and `tool.called`, calls `mail` once, records `tool.result` with `outcome: "ok"`, and the agent goes on with the result.
- Given the same run with sending off,
  when the agent calls `send_mail`,
  then no person is asked, the model gets `Refused: sending is off for the connector "mail"`, and nothing is recorded or called.
- Given the same run waiting for the OK, and sending switched off since,
  when a person approves the call,
  then the model gets the same refusal, and nothing is recorded or called.
- Given the same run whose settings can't be read,
  when the agent calls `send_mail`,
  then the host gets the store's error, and the model gets only the reason.
- Given a run whose agent calls `send_mail` on `mail`, labelled `read`,
  when the agent's model calls it,
  then the run waits for a person's OK, and once approved records `effect.requested` before `mail` gets the call.
- Given a run waiting for `retry` or `skip` on a call to `send_mail` whose outcome is unknown, and sending switched off since,
  when a person retries the call,
  then `mail` isn't called, the run records `tool.result` with `outcome: "error"` and the reason, and the agent goes on with it.
- Given a run with a recorded call to `send_mail`,
  when the executor reports that the call failed (`effect-failed`),
  then the run doesn't fail: it records `tool.result` with `outcome: "unknown"` and waits for `retry` or `skip`.
- Given an engine that stopped after recording a call to `send_mail` and before making it,
  when an engine starts on the same store,
  then the call isn't made, the run records `tool.result` with `outcome: "unknown"` and waits for `retry` or `skip`.
