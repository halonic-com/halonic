# engine.provider-text

- Status: active
- Since: 0.1.0
- Source: Liam's decision on HAL-3116 to keep the provider's error text in the run log; task HAL-3119

When a model call fails with an error whose `cause` is a `VendorErrorText` (recognised by name and fields, not `instanceof`), the engine shall keep that text and its status, when it has one, in the `providerText` of the `run.failed` event the failure ends the run with, and of the `llm.fallback` event when the call moves on to the next model. It shall take nothing from any other `cause`, such as a network error or a reply that didn't parse, because no provider checked that text for keys. Without a `VendorErrorText` the events are written as before, without `providerText`.

## Examples

- Given a model call that fails with a `ModelCallError` whose cause is `VendorErrorText(400, "max_tokens is too large")`,
  when the run fails on it,
  then `run.failed` has `providerText: { status: 400, text: "max_tokens is too large" }` and its `error` is the error's message.
- Given a model call that fails with a `ModelCallError` whose cause is a `TypeError("fetch failed")`,
  when the run fails on it,
  then `run.failed` has no `providerText`.
- Given a model call that fails with a `ModelCallError` whose cause is `VendorErrorText(undefined, "unknown stream error")`,
  when the run fails on it,
  then `run.failed` has `providerText: { text: "unknown stream error" }`, without a `status`.
- Given a model that is offline, with a `VendorErrorText` from its proxy as the cause, and a fallback model,
  when the call moves on,
  then `llm.fallback` has that `providerText`.
