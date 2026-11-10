# engine.busy-falls-back

- Status: active
- Since: 0.1.0
- Source: board decision B on HAL-3118 (question from HAL-3116), built on HAL-3178; changes the rule of [plan-providers](/HAL/issues/HAL-1061#document-plan-providers), approved with changes on HAL-1880, that a turn moves on only for a missing key or an offline model

When a model call fails because the provider is busy (`provider-busy`: it was overloaded or asked Halonic to slow down, such as an HTTP 429 that isn't about credit, a 5xx, or Anthropic's 529), the engine shall hand the call to the next model of the turn at once, with no wait and no retry, write an `llm.fallback` naming both models and the error, and send the turn's later calls to that model too, as it does for an offline model (requirement `engine.offline-falls-back`). When no model is left and the last one was busy, the turn shall fail with a `ModelCallError` whose reason is `provider-busy`, and a run that fails this way has the reason `provider-busy`. A refused key and an empty account still stop the turn (requirement `engine.model-failure-stops`): the person has to fix them, and moving on would hide that and could move their spending to another provider.

## Examples

- Given the alias `smart` falling back to `local`, and `smart`'s provider busy,
  when a chat turn runs under a fake clock,
  then `local` answers, the log holds `llm.request`, `llm.fallback` from `smart` to `local` with the busy error, and `llm.response` from `local`, and no time passed.
- Given `smart` falling back to `backup`, both busy,
  when a chat turn runs,
  then each is called once, and the turn fails with reason `provider-busy`, and the run's failure reason is `provider-busy`.
- Given `smart` offline, falling back to `backup` whose provider is busy,
  when a chat turn runs,
  then the turn fails with reason `provider-busy`, the cause of the last model.
