# model-mock.script-left

- Status: active
- Since: 0.1.0
- Source: HAL-187; the old mock model (`packages/llm/mock`) at 784f78d

The mock model shall report how many scripted replies are left for each script key and shall keep every request it was sent, so a test can check that it used its whole script and see what was asked.

## Examples

- Given the script `{ writer: ["one", "two"] }`,
  when the writer is answered once,
  then one reply is left for the writer and one request was kept.
