# ports.tunnel-resolver

- Status: active
- Since: 0.2.0
- Source: tunnel phase A of the plan "phone reaches a runtime host through pluggable tunnels", approved by the board on 11 Nov; task HAL-5684

The `TunnelResolver` port (version 1) shall turn an endpoint into a `TunnelTransport` on the phone. A transport shall reconnect by itself while the app is in the foreground, without a limit on tries, waiting `tunnelReconnectDelayMs` before each try: 500 ms for the first, doubling, at most 30 s, each moved by up to 20 % either way. A connection open for 30 s shall start the backoff again from the first try. In the background a transport shall be paused: its connection closed and no timer left. Resuming shall connect at once. A transport shall never queue or resend a frame across a reconnect.

## Examples

- Given try 1 and a random number of 0.5,
  when the delay is computed,
  then it is 500 ms.
- Given try 4 and a random number of 0.5,
  when the delay is computed,
  then it is 4,000 ms.
- Given try 20,
  when the delay is computed with random numbers of 0 and of just under 1,
  then it is 24,000 ms and at most 36,000 ms.
- Given try 0 or try 1.5,
  when the delay is computed,
  then it throws a `RangeError`.
- Given the transport,
  when its methods are listed,
  then they are exactly `state`, `onState`, `send`, `frames`, `pause`, `resume` and `close`.
