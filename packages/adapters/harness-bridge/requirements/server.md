# harness-bridge.server

- Status: active
- Since: 0.1.0
- Source: HAL-194 (build plan B1, decisions 4 and 6); `HarnessBridgeServer` port v1

The Node bridge server shall serve each run on its own free port of `127.0.0.1` with a new random token, and shall answer a request only when its `x-halonic-run-token` header holds exactly that token, compared in constant time; any other request shall get a 401 whatever its path. When a request with the token names a path the bridge doesn't serve, it shall answer 404. When a request's body is larger than the size limit or doesn't arrive within the time limit, the bridge shall answer 400 without reading the rest. An error reply from the bridge itself shall have a kind and never contain the run token. When the bridge is closed, or the run's signal aborts, it shall refuse new requests, abort the requests in flight and resolve once they have ended; closing twice shall be safe.

## Examples

- Given an open bridge,
  when a request comes without the token or with another token,
  then it gets a 401 and the reply doesn't contain the token.
- Given a size limit of 16 bytes,
  when a request with the token sends 17 bytes,
  then it gets a 400 and the route never runs.
- Given a request in flight,
  when the bridge is closed,
  then the route's signal aborts, `close()` resolves, and a new request can't connect.
