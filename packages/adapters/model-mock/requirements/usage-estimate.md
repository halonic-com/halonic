# model-mock.usage-estimate

- Status: active
- Since: 0.1.0
- Source: HAL-187; the old mock model (`packages/llm/mock`) at 784f78d

The mock model shall report token usage as the characters of all request messages divided by four, rounded up, for input, and the characters of the reply divided by four, rounded up, for output, so recorded event logs and budget tests keep their numbers.

## Examples

- Given a request whose messages hold 9 characters in total,
  when the model replies "Hello",
  then it reports 3 input tokens and 2 output tokens.
