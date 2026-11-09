# engine.turn-round-limit

- Status: active
- Since: 0.1.0
- Source: HAL-1061, rules agreed on HAL-1516

When a model turn has made its most model calls and the last answer still calls tools, the engine shall end the turn with that answer's text, `finishReason` `length` and no tool calls, and shall return a `call` refusal for each call it dropped. The last answer in the turn's messages shall carry no calls and no provider replay.

## Examples

- Given a limit of 2 model calls and a model that calls `lookup` every time,
  when the turn runs,
  then the model is asked twice, `lookup` runs once, and the turn ends with `length`, no calls and one refusal for the dropped call.
