# agent-host.engine-run-updates-cap

- Status: active
- Since: unreleased
- Source: HAL-14217; HAL-17004; security review on HAL-14212

While 8 `GET /api/run-updates` streams are open on the engine role's listener, when a request for a new one passes the engine server's checks, the listener shall refuse it with 503 and the error `too_many_streams`, and shall keep every open stream. When an open stream closes, its place shall be free for a new one. A request the engine server refuses shall not count against the cap.

## Examples

- Given 8 open run-update streams,
  when a ninth is asked for with the token,
  then it gets 503 `too_many_streams`, and the 8 open streams still get every frame.
- Given the cap reached,
  when one open stream's caller hangs up,
  then the next stream asked for is served.
- Given the cap reached,
  when a request for a stream comes without the token,
  then it gets 401, not 503.
