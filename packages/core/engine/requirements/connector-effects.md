# engine.connector-effects

- Status: active
- Since: 0.1.0
- Source: HAL-1532, step 4(c) of the [HAL-186 implementation plan](/HAL/issues/HAL-186#document-implementation-plan), "Idempotency keys and unknown outcome"

When a task state's agent stops before a connector call that can change things, the engine shall record, in one append and before it makes the call, `effect.requested` under a call id it makes itself (`call-<n>`, unique in the run) with the idempotency key `<runId>:<callId>`, then `connector.started` with the call's time limit, then `tool.called`, and shall then ask for a `call-tool` effect with the same call id and key. When that call answers, the engine shall record `tool.result` with its `outcome` and shall ask for a new model call under the next call id that goes on from where the agent stopped, with the result. A result for any call the state doesn't wait on shall change nothing.

## Examples

- Given a `draft` task state of run `r-acme` whose agent was asked `call-1`,
  when `call-1` stops before `send_mail` on the connector `mail`,
  then the engine records `effect.requested` with call id `call-2` and key `r-acme:call-2`, `connector.started` for `mail` with `timeoutMs: 60000`, and `tool.called`, and asks for `call-tool` with `call-2` and `r-acme:call-2`.
- Given that run,
  when `call-2` answers `Sent` with outcome `ok`,
  then the engine records `tool.result` with `Sent` and `outcome: "ok"`, and asks for `call-3`, which goes on with `Sent`.
- Given that run,
  when a result for `call-9` arrives,
  then the engine records nothing.
