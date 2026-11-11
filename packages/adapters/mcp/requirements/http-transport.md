# mcp.http-transport

- Status: active
- Since: 0.1.0
- Source: HAL-4846 (Liam's decision on HAL-2824: the CLI reads a source's tool listing over `http` too); MCP 2025-11-25, streamable HTTP transport; `integrations/mcp`'s transport

The HTTP transport shall send each MCP message as a `POST` to the connector's address through the host's `HttpClient`, with the connector's headers, never following a redirect. It shall read the answer to a request as one JSON message or as an event stream, giving each message before the answer to the session and stopping at the answer. It shall keep a session id the server gives in its answer to `initialize`, refusing one that isn't visible ASCII, send it and the agreed protocol version with every later message, and end the session with `DELETE` on close, also when the server says it already ended. It shall turn an error status into a typed error without reading the server's text, and `404` after a session started into `session-expired`. It shall fail a request, with a typed error, when its answer isn't read within the request timeout, when the caller cancels it, when a message is larger than the message limit, or when the answer isn't JSON or an event stream.

## Examples

- Given a server that answers `initialize` with the session id `session-1`,
  when the session lists tools,
  then the `tools/list` request carries `Mcp-Session-Id: session-1` and `MCP-Protocol-Version: 2025-11-25`.
- Given a server that answers 401 with text that names a key,
  when a request is sent,
  then it fails as `not-signed-in` and the error doesn't contain the server's text.
- Given a server that never answers,
  when the request timeout passes,
  then the request fails saying the server didn't answer in time.
