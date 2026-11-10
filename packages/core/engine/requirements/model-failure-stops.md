# engine.model-failure-stops

- Status: active
- Since: 0.1.0
- Source: HAL-1061 "Providers and fallback"; plan approved with changes on HAL-1880; `out-of-memory` and the reason of an all-offline chain added on HAL-2085 (HAL-1728); a key that isn't accepted, an account out of credit and a busy provider added on HAL-3008

When a model call fails because the model is missing, the model can't use tools, the model ran out of memory, the provider didn't accept the key, the account at the provider is out of credit, the provider is busy, the provider refused the call, or with any error that isn't a `ModelCallError`, the engine shall stop the turn with that error and try no other model. Nothing shall be guessed in advance: the engine learns it from the provider's answer. A run that fails this way shall have the reason `runFailureReasonOf` gives (requirement `engine.run-failure-reason-of`): `model-missing` or `model-no-tools` for those two, `model-out-of-memory` when it ran out of memory, `key-refused`, `out-of-credit` or `provider-busy` for those three, and `error` for a refused call or any other error. When every model was offline, the run shall fail with `model-unreachable` and the host of the last one that didn't answer, when its provider named it.

## Examples

- Given the alias `local` whose model can't use tools, falling back to `smart`,
  when a chat turn runs,
  then it fails with a `ModelCallError` whose reason is `model-no-tools`, and `smart` is never called.
- Given a model that is missing at its provider,
  when a run asks for the failure reason of its error,
  then it is `model-missing`.
- Given the alias `local` at `localhost:11434` and its fallback `smart`, both offline,
  when a chat turn runs,
  then it fails with a `ModelCallError` whose reason is `offline`, and the run's failure reason is `model-unreachable` with the host `localhost:11434`.
- Given a provider that has its key and doesn't accept it, with a fallback,
  when a chat turn runs,
  then it fails with reason `key-refused`, and the fallback is never called.
