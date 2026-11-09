# engine.turn-caller-tools-return

- Status: active
- Since: 0.1.0
- Source: HAL-1061, rules agreed on HAL-1516

When the model calls one of the caller's tools, the engine shall end the turn with `finishReason` `tool_calls` and only the calls to the caller's tools, without running them. If the same answer also calls tools the engine runs itself, then the engine shall run those first and add their results after that answer, so the caller's next request has a result for every call in it once the caller adds its own.

## Examples

- Given a model that calls the caller's tool `pick`,
  when the turn runs,
  then it ends with `tool_calls`, the call to `pick` and one model call.
- Given a model whose answer calls the caller's `pick` and the server's `lookup`,
  when the turn runs,
  then `lookup` runs, its result follows the answer in the turn's messages, and the turn ends with `tool_calls` and only the call to `pick`.
