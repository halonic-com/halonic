# test-runner.test-model

- Status: active
- Since: 0.1.0
- Source: the old test runner (`packages/testing/test-runner`) at 784f78d, its recorded run logs (`packages/testing/parity/fixtures/base/run-logs.json`), and HAL-7398

When a case's run calls a model, the test runner shall name the model as a real run does: the call's alias, else the `model` of the call's agent, else the hub's default model, else the workspace's, resolved from `models.yaml` and the hub's own aliases. The call shall log that model, and shall be priced from the alias's `price`, as a call to a model on this computer. The case's scripted model shall still answer every call, so the alias's provider and fallbacks are never reached.

When the hub has no alias of that name, the call shall log the model `test`, with no price, so its cost is 0.

The old runner logged the agent's resolved model and its cost the same way. Before HAL-7398 the new runner logged every call as `test`, with cost 0.

## Examples

- Given `models.yaml` with `fast: { provider: mock, model: echo-fast, price: { input: 0.05, output: 0.2 } }` and an agent whose `model` is `fast`, when its step's model call uses 26 input and 3 output tokens, then `llm.request` and `llm.response` name the model `echo-fast` and the response costs 0.0000019.
- Given an agent with no `model`, in a workspace with no `models.yaml`, when its step calls the model, then the call logs the model `test` and costs 0.
