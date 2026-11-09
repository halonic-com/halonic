# ports.model-call-error

- Status: active
- Since: 0.1.0
- Source: [plan-providers](/HAL/issues/HAL-1061#document-plan-providers) for the chat turn's model fallback, approved with changes on HAL-1880; an added export and documentation keep `llmProviderVersion` at 1

The `LlmProvider` port shall give providers a `ModelCallError` to throw when a model call fails, with a `reason` that is exactly one of `no-key`, `offline`, `model-missing`, `model-no-tools` and `refused`, and an `isModelCallError(value)` check that tells it apart by its `name` and `reason`, without `instanceof`, so it works when an adapter has its own copy of the package. The documentation of `chat()` and `stream()` shall state that they throw it, that a stream that fails gives the same reason `chat()` would, and that a caller treats any other error as `refused`. A provider that has a key and is turned away shall say `refused`, not `no-key`.

## Examples

- Given `new ModelCallError("offline", "no route to host")`,
  when it is checked with `isModelCallError`,
  then it passes, and its `reason` is `offline` and its `name` is `ModelCallError`.
- Given an `Error` from another copy of the package, named `ModelCallError` with `reason: "model-missing"`,
  when it is checked with `isModelCallError`,
  then it passes.
- Given a plain `Error`, an `Error` named `ModelCallError` with an unknown reason, or an object that only looks like one,
  when it is checked with `isModelCallError`,
  then it fails.
- Given the reason type,
  when it is listed,
  then it is exactly `no-key`, `offline`, `model-missing`, `model-no-tools` and `refused`.
