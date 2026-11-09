# ports.model-call-error

- Status: active
- Since: 0.1.0
- Source: [plan-providers](/HAL/issues/HAL-1061#document-plan-providers) for the chat turn's model fallback, approved with changes on HAL-1880; `out-of-memory` and `host` added on HAL-2085 (HAL-1728). An added export, an added reason and documentation keep `llmProviderVersion` at 1

The `LlmProvider` port shall give providers a `ModelCallError` to throw when a model call fails, with a `reason` that is exactly one of `no-key`, `offline`, `model-missing`, `model-no-tools`, `out-of-memory` and `refused`, an optional `host` that it keeps only with `offline` (the name and port that didn't answer, never a URL with a path, a query or a key), and an `isModelCallError(value)` check that tells it apart by its `name`, `reason` and `host`, without `instanceof`, so it works when an adapter has its own copy of the package. The documentation of `chat()` and `stream()` shall state that they throw it, that a stream that fails gives the same reason `chat()` would, and that a caller treats any other error as `refused`. A provider that has a key and is turned away shall say `refused`, not `no-key`.

## Examples

- Given `new ModelCallError("offline", "no route to host")`,
  when it is checked with `isModelCallError`,
  then it passes, and its `reason` is `offline` and its `name` is `ModelCallError`.
- Given `new ModelCallError("offline", "Ollama didn't answer.", { host: "localhost:11434" })`,
  when it is read,
  then its `host` is `localhost:11434`; given the same `host` with `refused`, it has no host.
- Given an `Error` from another copy of the package, named `ModelCallError` with `reason: "model-missing"`,
  when it is checked with `isModelCallError`,
  then it passes.
- Given a plain `Error`, an `Error` named `ModelCallError` with an unknown reason or a `host` that isn't a string, or an object that only looks like one,
  when it is checked with `isModelCallError`,
  then it fails.
- Given the reason type,
  when it is listed,
  then it is exactly `no-key`, `offline`, `model-missing`, `model-no-tools`, `out-of-memory` and `refused`.
