# server.error-body

- Status: active
- Since: 0.1.0
- Source: HAL-9 plan phase 4; docs/guides/failure-path.md rule 4; build plan on HAL-195 (PR 2)

The server shall send every error as a JSON `ServerErrorBody` with a stable `code` and one short `message`, and nothing else: no stack, path, secret or cause. `handle` shall not throw: an unexpected failure shall answer status 500 with the code `internal_error` and shall hand its cause to the `errorLog` port. `createServer` shall throw a `RangeError` for an unusable config: an empty `allowedHosts`, a `dailyRequests` that isn't a whole number above zero, or a `maxBodyBytes` that isn't a whole number above zero.

Rationale: raw internal errors tell a caller about the host, and a client needs a code it can switch on.

## Examples

- Given a secrets store that fails with a message naming a path, when a request arrives, then the answer is 500 with `internal_error` and the path appears nowhere in it.
- Given `dailyRequests` of 0 or 1.5, when the server is built, then it throws a `RangeError`.
