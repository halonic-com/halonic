# engine.provider-text

- Status: active
- Since: 0.1.0
- Source: Liam's decision on HAL-3116 to keep the provider's error text in the run log; task HAL-3119. Key check and cap from Liam's review of #1017; task HAL-3558

When a model call fails with an error whose `cause` is a `VendorErrorText` (recognised by name and fields, not `instanceof`), the engine shall keep that text and its status, when it has one, in the `providerText` of the `run.failed` event the failure ends the run with, and of the `llm.fallback` event when the call moves on to the next model. It shall take nothing from any other `cause`, such as a network error or a reply that didn't parse, because no provider checked that text for keys. Without a `VendorErrorText` the events are written as before, without `providerText`. The engine shall not rely on the adapter's own checks: it shall drop the text when it is empty or holds something shaped like a key (`findSecretShape`, on the whole text), and keep at most 300 characters of it, with "…" after a cut.

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
- Given a model call that fails with a `VendorErrorText` cause whose text holds `sk-` and a key-shaped run of characters,
  when the run fails on it,
  then `run.failed` has no `providerText`.
- Given a model call that fails with a `VendorErrorText(400, …)` cause of 5,000 characters,
  when the run fails on it,
  then `run.failed` has `providerText` with the first 300 characters followed by "…".
