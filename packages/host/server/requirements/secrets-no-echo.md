# server.secrets-no-echo

- Status: active
- Since: unreleased
- Source: HAL-1292 (T4, PR 4a); security review of `server.google-secret` (HAL-705)

The server shall keep the key's value and its name out of every answer of the `/api/secrets/<name>` routes, every request log line and every error handed to the error log. The request log shall leave out every path under `/api/secrets/`. When the store's `set` or `remove` throws, the server shall answer 500 `internal_error` and give the error log the error as the store threw it, with no body, URL or name added. The routes shall call only `has`, `set` and `remove` of the store, never anything that returns a value.

Rationale: a name can be a value pasted in the wrong field, and a log is read by people who never see the key block.

## Examples

- Given a store that throws on `set`, when a `PUT` carries a canary value and name, then the answer, the request log and the error log hold neither.
- Given a bad body that contains a canary value, then nothing the server said holds it.
