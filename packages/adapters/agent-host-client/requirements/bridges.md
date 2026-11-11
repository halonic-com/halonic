# agent-host-client.bridges

- Status: active
- Since: 0.1.0
- Source: HAL-4878, HAL-4730; `apps/agent-host/README.md`, "The bridge over loopback"

The stand-in bridge host shall open each agent's bridge with `POST /v1/bridge/open` and `{ runId, agentId, providers, prices }`, giving the engine the url and token of the host's `opened` line. When the host refuses, or its first line is `failed`, isn't of the expected shape or never comes, it shall throw and hang up the stream. While the bridge is open, it shall answer each `call` line with Studio's recorder, tools, approvals or keys by its method, sending `POST /v1/bridge/answer` with the result, or with an error for an unknown method, arguments of the wrong shape or a service that fails. Calls shall be answered side by side, and a `cancel` line shall abort that call's signal and send no answer. An answer over 1 MiB in UTF-8 shall not be sent: an error answer for that call goes instead, and the same when the host answers 413 (HAL-4730). Closing shall send `POST /v1/bridge/close`, count a bridge the host has already closed as closed, and wait until the host ends the stream.

## Examples

- Given a host that opens bridge `b1`,
  when the bridge calls `secrets.get` for `anthropic-key`,
  then Studio answers that call on `b1` with the key.
- Given a tool whose result is 2 MiB,
  when the bridge calls `tools.call`,
  then the host gets an error answer for that call, and the call doesn't wait.
- Given an approval still waiting,
  when the host cancels the call,
  then the approval's signal aborts and no answer is sent.
