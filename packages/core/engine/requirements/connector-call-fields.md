# engine.connector-call-fields

- Status: active
- Since: 0.1.0
- Source: HAL-5214, findings of the 11 Nov code review

When the local executor makes a connector call a run recorded, it shall hand the host's `callTool` only the call's own fields: `type`, `callId`, `idempotencyKey`, `state`, `agent`, `connector`, `tool`, `args` and `timeoutMs`. It shall never hand it the prompt or the conversation the agent stopped in.

## Examples

- Given a run whose agent stopped before a call to `send_mail` on `mail`,
  when the call's timer is due,
  then `callTool` gets an effect with exactly those fields, and no `prompt`, `resume` or `unknown`.
