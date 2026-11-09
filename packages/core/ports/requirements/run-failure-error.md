# ports.run-failure-error

- Status: active
- Since: 0.1.0
- Source: [HAL-1668 failure-path decisions](/HAL/issues/HAL-1668#document-decisions); task HAL-1728, reviewed on HAL-2085

The ports package shall give adapters that aren't model providers one error, `RunFailureError`, to say why a run can't go on, with a `failure` that is exactly one of `disk-full`, `sandbox-start-failed` and `harness-start-failed`, and an `isRunFailureError(value)` check that tells it apart by its `name` and `failure`, without `instanceof`, so it works when an adapter has its own copy of the package. A model provider says why a call failed with `ModelCallError` instead, so the model fallback can read it. The engine decides `budget`, `cancelled`, `interrupted` and `error` itself, so an adapter can't name them.

## Examples

- Given `new RunFailureError("sandbox-start-failed", "The sandbox didn't start.")`,
  when it is checked with `isRunFailureError`,
  then it passes, and its `failure` is `sandbox-start-failed` and its `name` is `RunFailureError`.
- Given an `Error` from another copy of the package, named `RunFailureError` with `failure: "disk-full"`,
  when it is checked with `isRunFailureError`,
  then it passes.
- Given a plain `Error`, an `Error` named `RunFailureError` with the failure `model-unreachable` or `budget`, or an object that only looks like one,
  when it is checked with `isRunFailureError`,
  then it fails.
- Given the failure type,
  when it is listed,
  then it is exactly `disk-full`, `sandbox-start-failed` and `harness-start-failed`.
