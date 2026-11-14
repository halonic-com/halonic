# server.request-log

- Status: active
- Since: 0.1.0
- Source: HAL-710 (build plan B5, D6); security review HAL-705 (A7)

When the host passes a `requestLog` port, the server shall record one entry per finished request with its method, its path and its status, and nothing else: never the query string, a header, the body or the client's address. It shall record nothing for a request to a route that takes a client secret (`PUT /api/google/setups/<accountRef>/secret`). The log entry of a request that failed shall have the status the caller got, 500, and never the cause.

Rationale: an authorisation code arrives in the query string of the sign-in callback, and a secret in a body. A log of paths and statuses can't hold either.

## Examples

- Given `GET /api/hello?code=fake-code`, then the entry's path is `/api/hello`.
- Given a `PUT` to a secret route, then no entry is recorded, whatever its status.
- Given a request that fails inside a route, then the entry's status is 500.
