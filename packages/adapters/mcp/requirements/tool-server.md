# mcp.tool-server

- Status: active
- Since: unreleased
- Source: HAL-16751 (moved from the harness bridge, HAL-16737)

The MCP tool server in `src/server/` shall answer one JSON-RPC 2.0 message at a time, without a transport, for a set of tools it is given. It shall answer `initialize` with the client's MCP version when it speaks it (2025-11-25, 2025-06-18 or 2025-03-26), otherwise with the newest it speaks, and the `tools` capability; `ping` with an empty result; `tools/list` with the set's tools in their order; `tools/call` with the set's answer as one text content and its error flag; and any other method with the error "method not found". It shall give no reply to a notification or a response. A body that isn't JSON shall get a parse error with a `null` id; a batch, a message that isn't JSON-RPC 2.0, a request without a string method, with a `null` or fractional id, or with params that aren't an object, an invalid request error; and a `tools/call` without a tool name or with arguments that aren't an object, an invalid params error, without calling the tool. When the set fails to list or call its tools, the client shall get an internal error whose message doesn't contain the failure's own text, and the failure shall go to the server's `reportError`.

## Examples

- Given a client that sends `initialize` with version 1999-01-01,
  when the server answers,
  then the reply has version 2025-11-25 and the `tools` capability.
- Given a set whose `call` answers `no such note` as an error,
  when the client calls that tool,
  then the result holds that text and `isError: true`.
- Given a set whose list fails with "store at /secret broke",
  when the client sends `tools/list`,
  then it gets an internal error without `/secret`, and `reportError` hears the failure.
- Given the message `{ "jsonrpc": "2.0", "id": 2, "method": "ping", "params": [1] }`,
  when the server reads it,
  then it answers an invalid request error for id 2.
