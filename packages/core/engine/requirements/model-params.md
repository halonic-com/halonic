# engine.model-params

- Status: active
- Since: 0.1.0
- Source: HAL-6450, Liam's decision on HAL-6444 after the findings of HAL-6432 (part 1): an alias's and an agent's `params` never reached the model

The engine shall send, with every model call it makes in a run, a subagent's turn or a chat turn, the params of three layers, each over the one before it, key by key: the `params` of the model's alias in `models.yaml`, then the `params` of the agent the call is for, then, on a chat turn, the request's own `params`. A key a layer leaves out shall keep the value below it; `extra` is one key and is replaced whole. When a call moves on to a fallback model (requirements `engine.offline-falls-back`, `engine.busy-falls-back`, `engine.skip-model-without-key`), the bottom layer shall be the fallback's own alias params, not the first model's. A call whose layers set no key shall send no `params`.

## Examples

- Given the alias `smart` with `temperature: 0.2` and `maxTokens: 800`, and an agent `writer` without `params`,
  when `writer`'s run calls its model,
  then the model gets `{ temperature: 0.2, maxTokens: 800 }`.
- Given the same alias, and `writer` with `temperature: 0.7` and `stop: ["END"]`,
  when `writer`'s run calls its model,
  then the model gets `{ temperature: 0.7, maxTokens: 800, stop: ["END"] }`.
- Given `smart` offline and falling back to `local` with `maxTokens: 300`, and `writer` with `temperature: 0.7`,
  when `writer`'s run calls its model,
  then `local` gets `{ maxTokens: 300, temperature: 0.7 }`, with nothing of `smart`'s.
- Given a chat turn with `writer` and `params: { temperature: 1 }`,
  when it calls the model,
  then the model gets `temperature: 1`, and the other keys of the alias and the agent.
