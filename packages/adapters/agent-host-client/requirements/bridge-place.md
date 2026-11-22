# agent-host-client.bridge-place

- Status: active
- Since: unreleased
- Source: HAL-13195

When the engine opens an agent's bridge, the stand-in bridge host shall tell the agent host where the agent runs for that call: `POST /v1/bridge/open` shall carry `runsOn`, the same placement `servicesFor` is told, so the host serves the bridge where the agent's program can reach it (`agent-host.bridge-place`).

## Examples

- Given the engine opens the bridge for an agent on this computer,
  when the client asks the host,
  then the open body says `runsOn: "this-computer"`.
- Given the engine opens the bridge for an agent in the sandbox,
  when the client asks the host,
  then the open body says `runsOn: "sandbox"`.
