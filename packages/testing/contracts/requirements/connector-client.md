# contracts.connector-client

- Status: active
- Since: 0.1.0
- Source: HAL-181; `ConnectorClient` and `ConnectorFactory` port v1; the grant rules of `ports.connector-trust-enforcement`

Where an adapter implements `ConnectorFactory`, it shall serve the transport kind it names and give each client its config's id, and a client shall be safe to close twice, also before it connected. For an `http` or `stdio` connector it shall list the server's tools exactly as the server wrote them, with `risk` and `untrusted` unchanged and absent where the server left them out, pass a call's tool name and arguments through unchanged, return the server's text, and throw for a tool error and for a tool the server doesn't have. Without a trust grant, an `http` connector shall still list its tools but call none of them, not even one the server marks `read`; a `stdio` connector shall start no program, so `listTools` and `callTool` throw; and the built-in `google` connector shall call only the tools whose own `risk` is `read`. No refused call shall reach the server or the service. With a grant, a `stdio` connector shall start its program on the first call, once per client, and stop it on `close`. The built-in `google` connector shall give every tool it lists a `risk`.

## Examples

- Given an `http` connector whose server marks `read_note` as `read`,
  when `read_note` is called without a trust grant,
  then the call throws and nothing reaches the server.
- Given a `stdio` connector and no trust grant,
  when its tools are listed,
  then it throws and no program has started.
- Given a trusted `stdio` connector,
  when its tools are listed and two tools are called,
  then one program has started, and after `close` none runs.
- Given the built-in `google` connector without a trust grant,
  when `gmail_send_draft` is called,
  then the call throws and nothing reaches Google, while a `read` tool such as `gmail_search` is answered.
