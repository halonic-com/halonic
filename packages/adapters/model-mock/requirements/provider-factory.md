# model-mock.provider-factory

- Status: active
- Since: 0.1.0
- Source: HAL-187; the old mock model (`packages/llm/mock`) at 784f78d

The mock model factory shall make a mock model for a provider of `type: mock` from its `options.script`, and shall refuse with an error that names the provider when the script isn't a map from agent id to a list of text replies.

## Examples

- Given a provider `{ id: "mock", type: "mock", options: { script: { writer: ["Hello"] } } }`,
  when the factory makes it,
  then the writer is answered "Hello".
- Given `options.script` of `{ writer: "Hello" }`,
  when the factory makes the provider,
  then it fails with an error naming `mock` and `options.script.writer`.
