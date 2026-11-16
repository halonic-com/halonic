# contracts.tunnel-provider

- Status: active
- Since: 0.2.0
- Source: tunnel phase A3 of the plan "phone reaches a runtime host through pluggable tunnels", approved by the board on 11 Nov; task HAL-5686; requirement `ports.tunnel-provider`

Where an adapter implements `TunnelProvider`, it shall pass this suite without network access of its own. It shall report an id and whether it is public and encrypts its path. Its `start` shall give an endpoint whose URL uses `https:`, `wss:` or `tcp:`, whose `providerId` is the capabilities' id and whose `public` is the capabilities' `public`, and the tunnel shall be `ready` when `start` resolves. It shall reject with a `RangeError` a config that is not the gateway on a loopback address, and a second config while a tunnel is up, and shall give the same endpoint for the same config again. Its status streams shall each begin with the current state, give a reason from the list exactly when the state is `degraded` or `down`, never repeat the same state and reason in a row, and end after `down` with reason `stopped`. Its `stop` shall do nothing when no tunnel is up.

## Examples

- Given a provider and a config for the gateway on loopback,
  when `start` resolves,
  then the endpoint uses `https:`, `wss:` or `tcp:`, and the current status is `ready`.
- Given a config whose host is `0.0.0.0` or whose port is the string "4100",
  when `start` is called,
  then it rejects with a `RangeError`.
- Given a tunnel that is up,
  when `start` is called with a config for another port,
  then it rejects with a `RangeError`.
- Given a status stream opened before `start`,
  when the tunnel is started and stopped,
  then the stream passes through `ready`, never repeats a state and reason, and ends with `down` and reason `stopped`.
- Given no tunnel is up,
  when `stop` is called twice,
  then neither call fails.
