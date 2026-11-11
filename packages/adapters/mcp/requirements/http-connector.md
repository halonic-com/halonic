# mcp.http-connector

- Status: active
- Since: 0.1.0
- Source: HAL-4846 (Liam's decision on HAL-2824); `ConnectorFactory` port v1; `contracts.connector-client`; `ports.connector-trust-enforcement`

The MCP HTTP connector factory shall pass `contracts.connector-client` for `http`. It shall reach its server only through the context's `http`. It shall start the session on the first call, with the connector's headers and, when the connector names a `secret`, that secret from the context's secrets as a bearer token in the `Authorization` header, never in the address or a message. It shall refuse a secret that isn't set, naming the secret, before any request, and try the start again on the next call. Without a trust grant it shall list tools, and refuse every tool call before sending anything. When the server says it forgot the session, the call shall fail and the next call start a new session. It shall list each tool with the `risk` and `untrusted` the server wrote in its `_meta`, throw an error whose message is ours for a tool's own failure, end the session on `close`, and refuse calls after it.

## Examples

- Given a trusted connector whose `secret` is `notes-token`,
  when its tools are listed,
  then every request carries `Authorization: Bearer <the secret's value>` and no message contains it.
- Given a connector without a trust grant,
  when a tool is called,
  then it throws and no request reaches the server.
