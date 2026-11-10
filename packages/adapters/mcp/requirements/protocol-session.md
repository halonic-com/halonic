# mcp.protocol-session

- Status: active
- Since: 0.1.0
- Source: HAL-230; ported from `integrations/mcp` (halonic-com/integrations, commit ab84889)

The MCP session shall open with `initialize`, asking for the newest protocol version it speaks, and then send `notifications/initialized`. It shall refuse a server that speaks none of its versions as `unsupported-version`, without repeating the server's version text, and it shall refuse to list or call tools before `initialize`. It shall list tools page by page, at most 10 pages and 200 tools, refusing a tool whose name or input schema breaks the spec, keeping the `com.halonic/risk` and `com.halonic/untrusted` keys of a tool's `_meta` and refusing a risk there other than `read`, `write` or `send`, and it shall list no tools, without asking, from a server that offers none. It shall send `tools/call` once and never retry it. It shall match each answer to its request by id and ignore answers to other ids, answer the server's `ping`, refuse every other request from the server with "method not found", and tell its caller when the server's tool list changed. It shall turn a server's JSON-RPC error into its own error without the server's text. When the caller aborts a request other than `initialize`, it shall tell the server with `notifications/cancelled`, and a failure to tell it shall not replace the caller's error.

## Examples

- Given a server whose `tools/list` answers ten pages that each have a `nextCursor`,
  when the tools are listed,
  then the listing fails as `unexpected-response` instead of asking for an eleventh page.
- Given a server that answers `tools/call` with error -32602 and the message "secret detail from the server",
  when the tool is called,
  then the call fails as `bad-arguments` and the error doesn't contain "secret detail".
- Given a caller that aborts while `tools/call` waits,
  when the call fails,
  then the last message sent is `notifications/cancelled` for that request's id.
