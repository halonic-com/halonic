# server.error-response

- Status: active
- Since: 0.1.0
- Source: HAL-1663 plan (surface mappings); docs/guides/failure-path.md rule 4; HAL-2738

The server shall turn a thrown error into a JSON reply of `{ code, message }`, plus `fix` when the error has one, where `code` is the error kind, with the status of its error kind: `invalid_input` 400, `unauthenticated` 401, `denied` 403, `not_found` 404, `conflict` 409, `limit_reached` 429, `unavailable` 503 and `internal` 500. A new error kind shall break the typecheck until it has a status. Only a `KindedError` of a kind other than `internal` keeps its message. An `internal` error and any other thrown value shall answer status 500 with a generic message and no `fix`: no stack, path, `errno`, provider text or internal name.

Rationale: a caller decodes `code` with `isErrorKind` and acts on it, and the text of an unknown error can tell a caller about the host.

## Examples

- Given a `KindedError` of kind `limit_reached` with a fix, then the reply is 429 with its kind as the code, message and fix.
- Given a plain `Error` whose message names a path, then the reply is 500 and the path appears nowhere in it.
