# model-mock.tool-call-lines

- Status: active
- Since: 0.1.0
- Source: HAL-187; the old mock model (`packages/llm/mock`) at 784f78d

When every non-blank line of a scripted reply has the form `tool:<name> <arguments>`, the mock model shall answer with one tool call per line, with ids `mock_call_<n>` counted per model, the arguments read as a JSON object or else passed on as `{ input: <text> }`, and the finish reason `tool_calls`.

## Examples

- Given the reply `tool:search {"q":"refund"}` followed by the line `tool:notify urgent`,
  when the model answers,
  then it calls `search` with `{ q: "refund" }` and `notify` with `{ input: "urgent" }`, and the content is empty.
