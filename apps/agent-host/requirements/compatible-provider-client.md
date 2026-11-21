# agent-host.compatible-provider-client

- Status: active
- Since: unreleased
- Source: HAL-15016 (follow-up from Liam's review of #4372, HAL-13798)

When a bridge in the agent host calls a compatible provider at its own address (`baseUrl`), the agent host shall make the call through a client that checks the address as a connector's address is and that never reaches one of Halonic's own ports: the host's own port and every open bridge's port, read on each call. A call to one of those ports shall fail before anything is sent, so a provider file can't hand the key, or the agent's requests, to the host's routes or to another bridge.

## Examples

- Given a compatible provider whose `baseUrl` is `http://127.0.0.1:<port>/v1` and `<port>` is the agent host's own port,
  when the bridge calls the provider,
  then the call fails and nothing reaches that port.
- Given the same `baseUrl` on a port of this computer that isn't one of Halonic's,
  when the bridge calls the provider,
  then the call reaches it.
