# workspace.call-model

- Status: active
- Since: 0.1.0
- Source: HAL-7454 (review of halonic#2197, HAL-7433: the CLI's resolver and the test runner shared a copy)

When a model call of a run is named, the workspace package shall give, in order, the call's alias, the `model` of the call's agent in its hub, the hub's default model, the workspace's default model, and `default`, so the CLI's resolver and the test runner pick the same model. When an alias's price is given to the engine, it shall keep the input and output prices and leave out each cache price the alias doesn't have.

## Examples

- Given a call with the alias `fast` for an agent whose `model` is `smart`, when it is named, then it is `fast`.
- Given a call for an agent whose `model` is `smart`, when it is named, then it is `smart`.
- Given a call for an agent with no `model`, in a hub whose `hub.yaml` has the default `fast` and a workspace whose default is `smart`, when it is named, then it is `fast`.
- Given a workspace without default models and a call without an alias or an agent, when it is named, then it is `default`.
- Given the price `{ input: 5, output: 25 }` with no cache prices, when it is given to the engine, then it is `{ input: 5, output: 25 }` with no cache keys.
