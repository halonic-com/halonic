# harness-host.bridge-this-computer

- Status: active
- Since: unreleased
- Source: HAL-13796 (an agent set to "On this computer" couldn't reach a bridge on a Unix socket)

The bridge host shall open the bridge of an agent a person chose to run on this computer on the host's `thisComputerBridgeServer`, when the host gives one, and every other agent's bridge on its `bridgeServer`. A host that gives no `thisComputerBridgeServer` shall open every bridge on its `bridgeServer`. The services, the recorder and the run are the same on either server.

## Examples

- Given a host with a `bridgeServer` and a `thisComputerBridgeServer`,
  when the engine opens the bridge of an agent in the sandbox,
  then it opens on the `bridgeServer` only; for an agent on this computer, on the `thisComputerBridgeServer` only.
- Given a host with only a `bridgeServer`,
  when the engine opens the bridge of an agent on this computer,
  then it opens on that `bridgeServer`.
