# agent-host-client.bridges

- Status: active
- Since: 0.1.0
- Source: HAL-4878, HAL-4730; `apps/agent-host/README.md`, "The bridge over loopback"

The stand-in bridge host shall open each agent's bridge with `POST /v1/bridge/open` and `{ runId, agentId, providers, prices }`, giving the engine the url and token of the host's `opened` line. When the host refuses, or its first line is `failed`, isn't of the expected shape or doesn't come within 30 s, it shall throw and hang up the stream. While the bridge is open, it shall answer each `call` line with Studio's recorder, tools, approvals or keys by its method, sending `POST /v1/bridge/answer` with the result, or with an error for an unknown method, arguments of the wrong shape, a call line of the wrong shape or a service that fails. `secrets.get` shall give only keys that a keyed provider of the bridge names, and `null` for any other name without asking Studio's secrets. A `call` line whose id is still waiting shall be skipped. Calls shall be answered side by side, and a `cancel` line shall abort that call's signal and send no answer. An answer shall be sent as well-formed text. An answer over 1 MiB in UTF-8, or with no JSON form, shall not be sent: an error answer for that call goes instead, and the same when the host refuses it with anything but 404 (HAL-4730). That error answer shall be sent at most once per call. Closing shall send `POST /v1/bridge/close`, count a bridge the host has already closed as closed, and wait until the host ends the stream and the answers on their way are sent, but not for a call it aborted because the stream ended.

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
- Given a bridge whose only keyed provider names `anthropic-key`,
  when the bridge calls `secrets.get` for `github-token`,
  then Studio answers `null` and never asks its secrets for it.
- Given a host that never sends the bridge's first line,
  when 30 s have passed,
  then `open` throws `bridge_failed` and hangs up the stream.
- Given a tool that ignores its signal and never returns,
  when the bridge is closed and the host ends the stream,
  then `close` resolves, and no answer is sent for that call.
