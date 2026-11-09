# model-mock.fallback-reply

- Status: active
- Since: 0.1.0
- Source: HAL-187; the old mock model (`packages/llm/mock`) at 784f78d

When an agent has no scripted reply left, the mock model shall answer with the fallback it was given, or, without one, with the text of the last user message.

## Examples

- Given a mock model with no script,
  when it is sent the user messages "Hi" and then "Bye",
  then it answers "Bye".
