# ports.tunnel-provider

- Status: active
- Since: 0.2.0
- Source: tunnel phase A of the plan "phone reaches a runtime host through pluggable tunnels", approved by the board on 11 Nov; task HAL-5684

The `TunnelProvider` port (version 1) shall make only the remote gateway reachable from a phone. Its config shall name the gateway by a loopback address and a port, and nothing else. It shall report its capabilities (whether the endpoint is public, whether the path is encrypted), give an endpoint whose URL uses `https:`, `wss:` or `tcp:`, stream its state as `starting`, `ready`, `degraded` or `down`, with a listed reason exactly when the state is `degraded` or `down`, and stop. Every adapter shall pass the `contracts.tunnel-provider` suite once the fake provider exists.

## Examples

- Given the port,
  when its methods are listed,
  then they are exactly `capabilities`, `start`, `status` and `stop`.
- Given a tunnel config,
  when its gateway host is `0.0.0.0` or a LAN address,
  then it doesn't compile.
- Given a status of `down`,
  when it is compiled without a reason,
  then it doesn't compile.
- Given a status of `ready`,
  when it is compiled with a reason,
  then it doesn't compile.
