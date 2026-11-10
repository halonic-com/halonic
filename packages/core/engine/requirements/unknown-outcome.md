# engine.unknown-outcome

- Status: active
- Since: 0.1.0
- Source: HAL-1532, step 4(c) of the [HAL-186 implementation plan](/HAL/issues/HAL-186#document-implementation-plan), "Idempotency keys and unknown outcome"

When a connector call that can change things breaks off without an answer, the engine shall record `tool.result` with `outcome: "unknown"` and `run.waiting` for `retry` and `skip`, and shall not make the call again on its own. When a person sends `retry`, the engine shall record `event.received`, then `effect.requested`, `connector.started` and `tool.called` again under the **same** call id and idempotency key, and shall ask for the call again with that key. When a person sends `skip`, the engine shall record `event.received` and shall ask for a new model call that goes on from where the agent stopped, with a result that says the call's outcome is unknown.

## Examples

- Given a run whose `call-2` to `send_mail` breaks off without an answer,
  then the engine records `tool.result` with `outcome: "unknown"` and `run.waiting` for `retry` and `skip`, and asks for no effect.
- Given that run,
  when `retry` is sent for `call-2`,
  then the engine records `effect.requested` for `call-2` with key `r-acme:call-2` again, and asks for `call-tool` with that key.
- Given that run,
  when `skip` is sent,
  then the engine asks for `call-3`, which goes on with a result that says the outcome is unknown and a person chose to go on.
- Given that run,
  when `retry` is sent for `call-1`,
  then the engine refuses it with `engine.decision-callid-must-match` and records nothing.
