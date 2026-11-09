# engine.model-failure-stops

- Status: active
- Since: 0.1.0
- Source: HAL-1061 "Providers and fallback"; plan approved with changes on HAL-1880

When a model call fails because the model is missing, the model can't call tools, the provider refused the call, or with any error that isn't a `ModelCallError`, the engine shall stop the turn with that error and try no other model. Nothing shall be guessed in advance: the engine learns it from the provider's answer. A run that fails this way shall have the reason `model-missing` or `model-no-tools` for those two, and `error` for any other.

## Examples

- Given the alias `local` whose model can't call tools, falling back to `smart`,
  when a chat turn runs,
  then it fails with a `ModelCallError` whose reason is `model-no-tools`, and `smart` is never called.
- Given a model that is missing at its provider,
  when a run asks for the failure reason of its error,
  then it is `model-missing`.
- Given a provider that has its key and refuses it, with a fallback,
  when a chat turn runs,
  then it fails with reason `refused`, and the fallback is never called.
