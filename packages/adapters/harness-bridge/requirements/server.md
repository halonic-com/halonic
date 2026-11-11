# harness-bridge.server

- Status: active
- Since: 0.1.0
- Source: HAL-194 (build plan B1, decisions 4 and 6); `HarnessBridgeServer` port v1; HAL-4735 (`Host` and `Origin` checks)

The Node bridge server shall serve each run on its own free port of `127.0.0.1` with a new random token, and shall answer a request only when it passes three checks, in this order, whatever its path: its `Host` header names `127.0.0.1` or `localhost` with the bridge's port, or it gets a 421; it has no `Origin` header, or it gets a 403; and its `x-halonic-run-token` header holds exactly that token, compared in constant time, or it gets a 401. When a request with the token names a path the bridge doesn't serve, it shall answer 404. When a request's body is larger than the size limit or doesn't arrive within the time limit, the bridge shall answer 400 without reading the rest. An error reply from the bridge itself shall have a kind and never contain the run token. When the bridge is closed, or the run's signal aborts, it shall refuse new requests, abort the requests in flight and resolve once they have ended and their routes have settled, or once the close time limit has passed; after that it shall record no event for the run. Closing twice shall be safe.

## Examples

- Given an open bridge,
  when a request comes without the token or with another token,
  then it gets a 401 and the reply doesn't contain the token.
- Given an open bridge,
  when a request with the token is addressed to another host, such as a web page's domain pointed at 127.0.0.1,
  then it gets a 421 and the reply doesn't contain the token.
- Given an open bridge,
  when a request with the token has an `Origin` header,
  then it gets a 403 and the reply doesn't contain the token.
- Given a size limit of 16 bytes,
  when a request with the token sends 17 bytes,
  then it gets a 400 and the route never runs.
- Given a request in flight,
  when the bridge is closed,
  then the route's signal aborts, `close()` resolves, and a new request can't connect.
- Given a route that records a call's spend once its request is aborted,
  when the bridge is closed,
  then `close()` resolves only after the spend is recorded.
- Given a route that is still running when the close time limit passes,
  when it then records an event,
  then `close()` has already resolved and the event is refused, not recorded.
- Given an event a route asked to record before the close time limit passed,
  when the recorder takes longer than the limit,
  then `close()` resolves only after the event is recorded.
