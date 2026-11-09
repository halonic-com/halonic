# engine.run-failure-reason-of

- Status: active
- Since: 0.1.0
- Source: [HAL-1668 failure-path decisions](/HAL/issues/HAL-1668#document-decisions); task HAL-1728, reviewed on HAL-2085

The engine shall turn the error that stopped a run into the reason its `run.failed` event records in one function, `runFailureReasonOf(error)`. A `ModelCallError` shall give `model-unreachable` for `offline`, with its host when it has one, `model-missing` and `model-no-tools` for those two, `model-out-of-memory` for `out-of-memory`, and `error` for `no-key` and `refused`. A `RunFailureError` from an adapter shall give its own failure. Both shall be recognised by name and fields, not `instanceof`, so an error from another copy of `@halonicjs/ports` gets the same reason. A Node error with the code `ENOSPC` shall be `disk-full`. An aborted call (`AbortError`) shall be `cancelled`. Anything else, including a timed-out call and an error that only has an error kind, shall be `error`. It shall read only the error itself, not its `cause`, as `errorKindOf` does. `budget` and `interrupted` don't come from an error: the engine sets them where it stops a run for its budget or finds a run it lost.

## Examples

- Given a `ModelCallError` for `offline` with the host `localhost:11434`,
  when its reason is worked out,
  then the reason is `model-unreachable` with the host `localhost:11434`.
- Given a `ModelCallError` for `out-of-memory`,
  when its reason is worked out,
  then the reason is `model-out-of-memory`.
- Given a `ModelCallError` for `no-key` or `refused`,
  when its reason is worked out,
  then the reason is `error`.
- Given an `Error` from another copy of `@halonicjs/ports`, named `RunFailureError` with `failure: "sandbox-start-failed"`,
  when its reason is worked out,
  then the reason is `sandbox-start-failed`.
- Given an `Error` with the code `ENOSPC`,
  when its reason is worked out,
  then the reason is `disk-full`.
- Given an `AbortError`,
  when its reason is worked out,
  then the reason is `cancelled`.
- Given a `TimeoutError`, a plain `Error`, or an `Error` whose `cause` is a `RunFailureError`,
  when its reason is worked out,
  then the reason is `error`.
