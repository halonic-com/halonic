# engine.approval-keeps-connector

- Status: active
- Since: unreleased
- Source: HAL-16338

When a run's model turn goes on after a person approved a call to a connector's tool, the engine shall make the call only to a tool of the connector the approval names (`connector` of `approval.requested`). When that connector offers no tool of that name in the turn that goes on, the engine shall not make the call, even when another connector offers a tool of that name: it shall answer it as a call whose connector didn't start (`engine.tool-result-cause`) when that connector's listing failed, and refuse it as a tool nobody offers otherwise. An approval from a log that names no connector shall go to the tool of that name. When a run's model turn goes on after the engine made a connector call that can change things (`engine.connector-effects`), the engine shall give the model the call's result inside the untrusted fence, whatever the connector lists in that turn.

## Examples

- Given a run whose writer lists `mail` and `archive`, which both list `send_mail`, so the turn offers `mail`'s and refuses `archive`'s,
  when a person approves the call to `mail`'s `send_mail` and `mail` then fails to list its tools,
  then nothing calls `archive`'s `send_mail`, and the call's result says `mail` didn't start.
- Given a run whose writer called `mail`'s `send_mail`, which a person approved and the engine made,
  when `mail` fails to list its tools as the writer goes on,
  then the model gets the call's result, fenced, not a refusal.
