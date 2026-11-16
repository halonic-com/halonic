# contracts.fake-tunnel-provider

- Status: active
- Since: 0.2.0
- Source: tunnel phase A3 of the plan "phone reaches a runtime host through pluggable tunnels", approved by the board on 11 Nov; task HAL-5686

The `FakeTunnelProvider` shall be a `TunnelProvider` that runs in the process and opens no socket, so tunnel phases B and C can be tested without a real tunnel. It shall pass the `contracts.tunnel-provider` suite. A test shall be able to move it to `degraded` or `down` with a listed reason, bring it back to `ready`, take it through a reconnect, make its next start end `down`, and give starting a latency, all in simulated time that moves only when the test advances it. Its endpoint shall use a host name under `.invalid`.

## Examples

- Given a fake started for the gateway on port 4100,
  when the test calls `drop("offline")`,
  then every open status stream gives `down` with reason `offline`.
- Given a dropped fake,
  when the test calls `reconnect`,
  then the streams give `starting` and then `ready`, and the call resolves with the same endpoint.
- Given a fake with a latency of 500 ms,
  when `start` is called,
  then the tunnel stays `starting` until the test advances the time by 500 ms.
- Given a fake told to fail its next start with `signed-out`,
  when `start` is called,
  then it rejects and the status is `down` with reason `signed-out`.
- Given a fake that is stopped while it is still starting,
  when the latency ends,
  then `start` rejects and the status stays `down` with reason `stopped`.
- Given any fake,
  when its endpoint is read,
  then the host name ends in `.invalid`.
