# engine.skip-model-without-key

- Status: active
- Since: 0.1.0
- Source: HAL-1061 "Providers and fallback" (HAL-1445 answer 3b); plan approved on HAL-1880

When a model of a turn names the secret of its provider's key and that secret isn't set, the engine shall skip the model before any call to it and go on to the next model of the turn, writing one `llm.skipped` with reason `no-key` and the next model's alias as `next`, or no `next` when none is left. A turn without a run log shall return the same skip in `skipped` instead. The engine shall only check whether the secret is set, never keep or log its value. A model that names no secret shall never be skipped this way.

## Examples

- Given the alias `smart` on a provider whose key isn't set, falling back to `default`, which needs no key,
  when a chat turn runs,
  then `smart` is never called, `default` answers, and the turn's `skipped` is `smart`, `no-key`, next `default`.
- Given the same models and a run log,
  when the turn runs,
  then the log starts with `llm.skipped` for `smart`, then `llm.request` for `default`.
- Given only models whose keys aren't set,
  when the turn runs,
  then it fails with a `ModelCallError` whose reason is `no-key`, and no model is called.
