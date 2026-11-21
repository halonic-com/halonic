# engine.tool-result-cause

- Status: active
- Since: unreleased
- Source: HAL-12471, plan approved by Liam on HAL-12575; follow-up to HAL-12429; the start causes in PR 2 of that plan; the approved call whose connector didn't start in HAL-13829 (CN1 of the C248 check on HAL-13818); the plugin reasons from HAL-14974 (Kim's C522 finding on HAL-14972: a run with a plugin added but not trusted warned only "couldn't list its tools")

When a connector call a run recorded fails and the engine knows why, the engine shall log the reason in the `cause` of its `tool.result` (`events.tool-result-cause`), and shall leave the text the model hears as it was:

- a call whose time limit ran out gets `time-limit`, with the limit in `seconds`; any other failure of the call keeps `outcome: "unknown"` and gets no cause;
- a call the engine was making when it stopped gets `engine-stopped`;
- a call the engine didn't make gets `not-made`, with `not-connected` when the agent's connector isn't among the run's or the engine makes no connector calls, `tool-gone` when the connector no longer offers the tool, `sending-off` when the tool sends and the "allow sending" check refused it, and `bad-arguments` when the arguments aren't an object;
- a call whose run's connectors couldn't start, or whose connector couldn't list its tools, gets `connector-not-started`: with `why: "program-missing"`, `"secret-not-set"`, `"plugin-not-trusted"` or `"plugin-changed"` and the program's or the secret's name or the plugin's id in `name`, cut to `maxCauseNameLength`, when the error is one `connectorStartFailureOf` reads (`ports.connector-start-failure`), else with `why: "other"` and no `name`; never any part of the error's message.

A call a person approved, whose connector couldn't list its tools when the agent went on after the approval, so the call isn't made, gets its `tool.result` with `outcome: "error"` and the same `connector-not-started` cause, and no `tool.called`; the model hears that the call wasn't made because the connector didn't start. The connector is the one the call's `approval.requested` names (`events.approval-requested-connector`). Other calls inside a model's turn and calls of harness tools get no cause.

## Examples

- Given a recorded call to `send_mail` whose connector doesn't answer,
  when its 60-second limit runs out,
  then `tool.result` has `outcome: "unknown"` and `cause: { code: "time-limit", seconds: 60 }`.
- Given a recorded call to `send_mail` whose connector fails,
  when the call ends,
  then `tool.result` has `outcome: "unknown"` and no cause.
- Given an engine that stopped after recording a call,
  when an engine starts on the same store,
  then `tool.result` has `cause: { code: "engine-stopped" }`.
- Given a call to a tool its connector no longer offers,
  when the engine is asked to make it,
  then the result has `cause: { code: "not-made", why: "tool-gone" }`.
- Given a run whose connectors fail to start with an error that names a secret's value,
  when the engine is asked to make a call,
  then the result has `cause: { code: "connector-not-started", why: "other" }`, and the value appears nowhere in the cause.
- Given a run whose connectors fail to start because the program `npx` isn't on this computer,
  when the engine is asked to make a call,
  then the result has `cause: { code: "connector-not-started", why: "program-missing", name: "npx" }`.
- Given a connector whose listing fails because the secret `MAIL_TOKEN` isn't set,
  when the engine is asked to make a call to it,
  then the result has `cause: { code: "connector-not-started", why: "secret-not-set", name: "MAIL_TOKEN" }`, and the call isn't made.
- Given a run waiting for a person's OK on `send_mail`, whose connector's program `acme-mail-mcp` was removed meanwhile,
  when the person approves the call,
  then the call isn't made, and its `tool.result` has `outcome: "error"` and `cause: { code: "connector-not-started", why: "program-missing", name: "acme-mail-mcp" }`, with no `tool.refused`.
