# engine.offline-falls-back

- Status: active
- Since: 0.1.0
- Source: HAL-1061 "Providers and fallback" (HAL-1444 §4); plan approved with changes on HAL-1880

When a model call fails because the provider is offline, the engine shall hand the call to the next model of the turn at once, with no wait and no retry, write an `llm.fallback` naming both models, and send the turn's later calls to that model too. A turn's models shall be the one its request resolved to, then that alias's own `fallback` entries in order, one level deep, each alias once. When no model is left, the turn shall fail with a `ModelCallError` whose reason is the last cause, `offline` or `no-key`, and whose message says so; a run that fails this way has the reason `error`.

## Examples

- Given the alias `smart` falling back to `local`, and `smart` offline,
  when a chat turn runs under a fake clock,
  then `local` answers, the log holds `llm.request`, `llm.fallback` from `smart` to `local`, and `llm.response` from `local` with `latencyMs` 0, and no time passed.
- Given `smart` falling back to `local` and `smart` again, where `local` falls back to `other`,
  when every model is offline,
  then `smart` and `local` are each called once, `other` never, and the turn fails with "offline: no model reachable".
- Given that failure,
  when a run asks for its failure reason,
  then it is `error`.
