# agent-host-client.bridge-socket

- Status: active
- Since: 0.1.0
- Source: HAL-6316 (each run's bridge on a private Unix socket on Linux and macOS); `apps/agent-host/README.md`, "The bridge over loopback"

When the host's `opened` line gives a `socketPath`, the stand-in bridge host shall give it to the engine as the bridge's `socketPath`, next to its url and token, so the sandbox's profile lets the program reach that socket by the bridge's name. Without one, the bridge shall have no `socketPath`.

## Examples

- Given a host whose `opened` line has `socketPath` `/srv/acme/halonic/bridges/r1/bridge.sock`,
  when a bridge opens,
  then the engine's bridge has that `socketPath`.
- Given a host whose `opened` line has no `socketPath`,
  when a bridge opens,
  then the engine's bridge has none.
