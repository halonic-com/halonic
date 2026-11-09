# model-mock.scripted-replies

- Status: active
- Since: 0.1.0
- Source: HAL-187; the old mock model (`packages/llm/mock`) at 784f78d

The mock model shall answer each agent with that agent's scripted replies in order, shall give agents without a script of their own the replies under `*`, and shall never fall back to `*` for an agent whose own script has run out.

## Examples

- Given the script `{ writer: ["one", "two"], "*": ["any"] }`,
  when the writer is answered three times and the editor once,
  then the writer gets "one", "two" and then the fallback, and the editor gets "any".
