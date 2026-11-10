# engine.run-failure-reason-of

- Status: active
- Since: 0.1.0
- Source: [HAL-1668 failure-path decisions](/HAL/issues/HAL-1668#document-decisions); task HAL-1728, reviewed on HAL-2085; `key-refused`, `out-of-credit` and `provider-busy` added on HAL-3008; `sandbox-not-ready` added on HAL-1709

The engine shall turn the error that stopped a run into the reason its `run.failed` event records in one function, `runFailureReasonOf(error)`. A `ModelCallError` shall give `model-unreachable` for `offline`, with its host when it has one, `model-missing` and `model-no-tools` for those two, `model-out-of-memory` for `out-of-memory`, `key-refused`, `out-of-credit` and `provider-busy` for those three, `key-refused` for `no-key` (no key stored is part of `key-refused`, microcopy 15.3), and `error` for `refused`. A `RunFailureError` from an adapter shall give its own failure. The engine's own `SandboxNotReadyError` shall give `sandbox-not-ready`, with the sandbox check's reason code; it is recognised only as the engine's own class, so an adapter can't name a sandbox reason. Both shall be recognised by name and fields, not `instanceof`, so an error from another copy of `@halonicjs/ports` gets the same reason. A Node error with the code `ENOSPC` shall be `disk-full`. An aborted call (`AbortError`) shall be `cancelled`. Anything else, including a timed-out call and an error that only has an error kind, shall be `error`. It shall read only the error itself, not its `cause`, as `errorKindOf` does. `budget` and `interrupted` don't come from an error: the engine sets them where it stops a run for its budget or finds a run it lost.

## Examples

- Given a `ModelCallError` for `offline` with the host `localhost:11434`,
  when its reason is worked out,
  then the reason is `model-unreachable` with the host `localhost:11434`.
- Given a `ModelCallError` for `out-of-memory`,
  when its reason is worked out,
  then the reason is `model-out-of-memory`.
- Given a `ModelCallError` for `provider-busy`,
  when its reason is worked out,
  then the reason is `provider-busy`.
- Given a `ModelCallError` for `no-key`,
  when its reason is worked out,
  then the reason is `key-refused`.
- Given a `ModelCallError` for `refused`,
  when its reason is worked out,
  then the reason is `error`.
- Given an `Error` from another copy of `@halonicjs/ports`, named `RunFailureError` with `failure: "sandbox-start-failed"`,
  when its reason is worked out,
  then the reason is `sandbox-start-failed`.
- Given the engine's `SandboxNotReadyError` for `bubblewrap-missing`,
  when its reason is worked out,
  then the reason is `sandbox-not-ready` with the sandbox reason `bubblewrap-missing`.
- Given an `Error` named `SandboxNotReadyError` that isn't the engine's own,
  when its reason is worked out,
  then the reason is `error`.
- Given an `Error` with the code `ENOSPC`,
  when its reason is worked out,
  then the reason is `disk-full`.
- Given an `AbortError`,
  when its reason is worked out,
  then the reason is `cancelled`.
- Given a `TimeoutError`, a plain `Error`, or an `Error` whose `cause` is a `RunFailureError`,
  when its reason is worked out,
  then the reason is `error`.
