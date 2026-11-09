# app.chat-turn-limit

- Status: active
- Since: 0.1.0
- Source: HAL-1539; `assistant.build.step-limit` in req-assistant and flow-assistant 3.6 (the turn limit, 16 unless Settings › Assistant or `assistant: { maxSteps }` sets 1 to 64)

If the model is still calling tools after the answer's turn limit of model turns, then the chat service shall run that turn's tool calls, make no further model turn and end the answer as stopped by the turn limit, with the number of turns. The turn limit shall be 16 when none is given. If a turn limit is not a whole number from 1 to 64, then the chat service shall throw a `RangeError` before it asks the model.

## Examples

- Given no turn limit,
  when the model calls a tool in each of 16 turns in a row,
  then no 17th turn is made, the 16th turn's tool calls have results, and the answer ends with the turn limit and 16 turns.
- Given a turn limit of 4, then the answer ends after 4 turns.
- Given a turn limit of 0, 65 or 2.5, then `answer` throws a `RangeError` and the model is not asked.
