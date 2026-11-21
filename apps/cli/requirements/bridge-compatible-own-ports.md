# cli.bridge-compatible-own-ports

- Status: active
- Since: unreleased
- Source: HAL-15251 (the CLI's side of HAL-15016)

When a harness run's bridge in the CLI calls a provider at the provider's own address (`baseUrl`), the CLI shall make the call through a client that checks the address as a connector's address is and that never reaches one of Halonic's own ports: the port of every bridge open in the engine, and `serve`'s port where `serve` runs, read on each call. A call to one of those ports shall fail before anything is sent, so a provider file can't hand the key, or the agent's requests, to another run's bridge or to `serve`.

## Examples

- Given a provider whose `baseUrl` is `http://127.0.0.1:<port>/anthropic` and `<port>` is `serve`'s port,
  when the agent calls its model through the bridge,
  then the call fails and nothing reaches that port.
- Given the same `baseUrl` and `<port>` is the port of another open bridge,
  when the bridge calls the provider,
  then the call fails before anything is sent.
- Given the same `baseUrl` on a port of this computer that isn't one of Halonic's,
  when the agent calls its model through the bridge,
  then the call reaches it.
