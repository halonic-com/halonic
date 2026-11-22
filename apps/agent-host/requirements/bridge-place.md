# agent-host.bridge-place

- Status: active
- Since: unreleased
- Source: HAL-13195 (the agent host's half of HAL-13090)

The agent host shall serve each run's bridge where that run's program can reach it. `POST /v1/bridge/open` shall take `runsOn`, where the run's program runs, and treat a body without it as `sandbox`. A run in the sandbox shall keep its bridge on a Unix socket in the profile's `bridges` folder on Linux and macOS, which the sandbox's proxy reaches (HAL-6316), and on a loopback port elsewhere. A run a person set to "On this computer" has no sandbox and no proxy, and the launcher refuses a socket bridge, so its bridge shall always be on a loopback port; the run's own token still guards it.

## Examples

- Given a host that serves sockets in its `bridges` folder,
  when Studio opens a bridge with `runsOn: "this-computer"`,
  then its server is made for this computer and serves on a loopback port.
- Given the same host,
  when Studio opens a bridge with `runsOn: "sandbox"`, or without `runsOn`,
  then its server is made for the sandbox and serves in the socket folder.
