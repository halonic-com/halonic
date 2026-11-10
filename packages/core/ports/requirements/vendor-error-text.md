# ports.vendor-error-text

- Status: active
- Since: 0.1.0
- Source: Liam's decision on HAL-3116 to keep the provider's error text in the run log; task HAL-3119. It was a copy in each model adapter since HAL-3008. An added export keeps `llmProviderVersion` at 1

The `LlmProvider` port shall give providers a `VendorErrorText` to put on a `ModelCallError`'s `cause` for an error reply: an `Error` named `VendorErrorText` whose message is the provider's own text, already shortened and checked for keys, and whose `status` is the HTTP status it came with, or undefined for an error in a stream whose type stands for no status. It shall give an `isVendorErrorText(value)` check that tells it apart by its `name` and a `status` that is a whole number or set to undefined, without `instanceof`, so it works when an adapter has its own copy of the package.

## Examples

- Given `new VendorErrorText(400, "max_tokens is too large")`,
  when it is checked with `isVendorErrorText`,
  then it passes, its `status` is 400 and its `message` is the text.
- Given an `Error` from another copy of the package, named `VendorErrorText` with `status: 429`,
  when it is checked with `isVendorErrorText`,
  then it passes.
- Given `new VendorErrorText(undefined, "unknown stream error")`,
  when it is checked with `isVendorErrorText`,
  then it passes and its `status` is undefined.
- Given a plain `Error`, an `Error` named `VendorErrorText` whose `status` is missing, a string or not a whole number, or an object that only looks like one,
  when it is checked with `isVendorErrorText`,
  then it fails.
