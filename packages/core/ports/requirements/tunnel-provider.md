# ports.tunnel-provider

- Status: active
- Since: 0.2.0
- Source: tunnel phase A of the plan "phone reaches a runtime host through pluggable tunnels", approved by the board on 11 Nov; task HAL-5684

The `TunnelProvider` port (version 1) shall make only the remote gateway reachable from a phone. Its config shall name the gateway by a loopback address and a port, and nothing else. `start` shall reject with a `RangeError` a config that fails `assertTunnelConfig` at runtime: fields other than `gateway`, a host other than `127.0.0.1` or `::1`, or a port that is not a whole number from 1 to 65535. The host shall call `assertGatewayTunnelConfig` with the port its own remote gateway listener is bound to before it calls `start`, so a config aimed at any other port (the bridge's, say) is refused with a `RangeError` and no provider is called. It shall report its capabilities (whether the endpoint is public, whether the path is encrypted), give an endpoint whose URL uses `https:`, `wss:` or `tcp:` and whose `public` equals `capabilities().public`, stream its state as `starting`, `ready`, `degraded` or `down`, with a listed reason exactly when the state is `degraded` or `down`, and stop. Every adapter shall pass the `contracts.tunnel-provider` suite once the fake provider exists.

## Examples

- Given the port,
  when its methods are listed,
  then they are exactly `capabilities`, `start`, `status` and `stop`.
- Given a tunnel config,
  when its gateway host is `0.0.0.0` or a LAN address,
  then it doesn't compile.
- Given a config read from JSON whose host is `0.0.0.0`,
  when it is checked with `assertTunnelConfig`,
  then it throws a `RangeError`.
- Given a config whose port is 0, 65536, 4100.5 or the string "4100",
  when it is checked with `assertTunnelConfig`,
  then it throws a `RangeError`.
- Given a config with a field besides `gateway`, or a gateway with a field besides `host` and `port`,
  when it is checked with `assertTunnelConfig`,
  then it throws a `RangeError`.
- Given a gateway listener on port 4100 and a config aimed at the bridge on port 4200,
  when the host checks it with `assertGatewayTunnelConfig(config, 4100)`,
  then it throws a `RangeError`.
- Given a config aimed at `::1` on port 4100,
  when the host checks it with `assertGatewayTunnelConfig(config, 4100)`,
  then it passes.
- Given a status of `down`,
  when it is compiled without a reason,
  then it doesn't compile.
- Given a status of `ready`,
  when it is compiled with a reason,
  then it doesn't compile.
