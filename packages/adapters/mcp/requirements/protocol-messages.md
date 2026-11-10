# mcp.protocol-messages

- Status: active
- Since: 0.1.0
- Source: HAL-230; ported from `integrations/mcp` (halonic-com/integrations, commit ab84889)

The MCP protocol shall read each message from a server as exactly one JSON-RPC 2.0 message and sort it into a request, a notification, a result or an error. It shall refuse a batch, another JSON-RPC version, a message with both a result and an error, a result without an id or with a `null` id, a request with a `null` id, a fractional id and a result that isn't an object, each as an `unexpected-response` error. It shall never read the text or data of a server's error.

## Examples

- Given the message `{ "jsonrpc": "2.0", "id": null, "error": { "code": -32700 } }`,
  when it is read,
  then it is an error for id `null` with code -32700.
- Given a list holding one result,
  when it is read,
  then it is refused as `unexpected-response`.
