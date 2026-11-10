# harness-bridge.mcp

- Status: active
- Since: 0.1.0
- Source: HAL-194 (build plan B6, B7); HAL-3999; HAL-4000; `HarnessBridgeServer` port v1

The Node bridge shall serve Halonic's tools for the run's agent over MCP's streamable HTTP transport at `/mcp`, under the token rule of `harness-bridge.server`. A `POST /mcp` shall carry one JSON-RPC 2.0 message: the bridge shall answer a request with one JSON reply, and a notification or a response with 202 and no body. It shall answer `initialize` with the client's MCP version when it speaks it (2025-11-25, 2025-06-18 or 2025-03-26), otherwise with the newest it speaks, and the `tools` capability; `ping` with an empty result; `tools/list` with the tools the run's `BridgeTools` offer, in their order, each with an object input schema; and any other method with the error "method not found". A body that isn't JSON, a batch, or a message that isn't JSON-RPC 2.0 shall get the matching JSON-RPC error, and a `mcp-protocol-version` header the bridge doesn't speak a 400. A `GET /mcp` shall get a 405, because the bridge sends no messages of its own.

For `tools/call`, the bridge shall first ask the run's `BridgeTools` to check the call, so the agent's `allow` and `approve` lists, the connection's "allow sending" setting and the workspace's trust apply as in the built-in loop. A call the check refuses shall not run and shall not be recorded; the program shall get `Refused: <reason>` as an error result. A call the check would ask a person about shall wait for the OK under the rules of `harness-bridge.approvals`. A call the check lets run shall be recorded as `tool.called` with its arguments before it runs and as `tool.result` with its result and outcome after, both naming the run's agent, and its result shall go to the program, as an error result unless its outcome is `ok`. A call that breaks off without an answer shall be recorded with the outcome `unknown`. When listing or checking the tools fails, the program shall get an internal JSON-RPC error whose message doesn't contain the failure's own text. No reply shall contain the run token.

## Examples

- Given a client that sends `initialize` with version 2025-06-18,
  when the bridge answers,
  then the reply has version 2025-06-18 and the `tools` capability.
- Given tools `read_issue` and `post_comment`,
  when the client sends `tools/list`,
  then it gets both, in that order, with their input schemas.
- Given a check that refuses `post_comment` because sending is off,
  when the client calls it,
  then the tool doesn't run, nothing is recorded, and the result is an error that starts with `Refused:`.
- Given a check that lets `read_issue` run,
  when the client calls it,
  then `tool.called` and `tool.result` are recorded and the program gets the tool's text.
- Given a client that sends `notifications/initialized`,
  when the bridge answers,
  then it answers 202 with no body.
