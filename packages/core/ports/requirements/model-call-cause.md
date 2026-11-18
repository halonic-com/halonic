# ports.model-call-cause

- Status: active
- Since: unreleased
- Source: HAL-12606 (a proxy failure read as "check your internet connection"). An added export, an added constructor option and two optional fields keep `llmProviderVersion` at 1

A `ModelCallError` shall take an optional `failureCause` (a `RunFailureCause`) and keep its `kind` as its own `kind` and its `code` and `detail` as its `failureCause`, so the engine's `failureCauseOf` logs them in `run.failed`; without one it shall have neither field. `networkCauseOf(error)` shall return the `kind`, `code` and `detail` that a network error carries by those fields, such as the HTTP client's `ProxyError`, and `undefined` for an error without a string `kind` and an object `failureCause`.

## Examples

- Given a `ProxyError`-like error with `kind: "denied"` and `failureCause: { code: "proxy.refused", detail: { status: "403" } }`,
  when `networkCauseOf` reads it,
  then it returns `{ kind: "denied", code: "proxy.refused", detail: { status: "403" } }`.
- Given that cause,
  when a `ModelCallError("offline", …, { failureCause })` is built,
  then its `kind` is `denied` and its `failureCause` is `{ code: "proxy.refused", detail: { status: "403" } }`.
- Given a `ModelCallError` built without one, or a plain `TypeError("fetch failed")`,
  when it is read,
  then it has no `kind` and no `failureCause`, and `networkCauseOf` returns `undefined`.
