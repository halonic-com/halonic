# workspace.model-aliases

- Status: active
- Since: 0.1.0
- Source: HAL-1524 (HAL-186 implementation plan, step 1c)

When a model setting is resolved for a hub, the workspace package shall resolve a name with a `/` to the provider before the first `/` and the model after it, and any other name to the alias of that name the hub can use: the hub's own alias in its `hub.yaml` over the one in `models.yaml`. It shall give the alias's provider, model, params and price, and the targets of its `fallback` entries, one level deep, leaving out a fallback no alias has. It shall give nothing for an alias the hub doesn't have.

## Examples

- Given `models.yaml` with `smart` at `anthropic/claude-opus-5-5`, when `smart` is resolved at the root, then it is that provider and model with the alias `smart`.
- Given hub `billing` whose `hub.yaml` points `smart` at `openai/gpt-5`, when `smart` is resolved in `billing`, then it is `openai/gpt-5`; at the root it stays `anthropic/claude-opus-5-5`.
- Given `smart` falling back to `fast` and `gone`, where `fast` falls back to `local`, when `smart` is resolved, then its fallback is only `fast`, without `fast`'s own fallbacks.
- Given `ollama/llama3:8b/q4`, when it is resolved, then the provider is `ollama` and the model `llama3:8b/q4`.
- Given an alias no file has, when it is resolved, then the result is `undefined`.
