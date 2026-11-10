# cli.workspace-models

- Status: active
- Since: 0.1.0
- Source: HAL-3814 (plan for `halonic run`, PR B, approved by Liam on HAL-3895)

The CLI shall turn a workspace's provider file into a model provider by its type: `mock` into the mock model; `anthropic` into Anthropic's Messages API; `openai`, `openai-compatible`, `ollama` and `lmstudio` into OpenAI's chat completions API. A provider without `baseUrl` shall use Anthropic's or OpenAI's own address, or the default address `doctor` shows for `ollama` and `lmstudio`. The key shall be read for each call from the secret the file names, through the workspace's view of the secrets, and a key that isn't set shall fail the call with `no-key`. A type the CLI has no adapter for, and an `openai-compatible` file without `baseUrl`, shall be a `not_found` error with a fix.

The CLI shall pick a model call's model from the agent editor's unsaved settings when the call has them, else from the call's alias, else the agent's `model`, else the hub's default model, else the workspace's. It shall resolve the name through the aliases the hub can use, or as `provider/model`, and give the model its provider, alias, secret name, price, whether it runs on this computer (always for the mock model) and its alias's fallbacks. An alias the hub doesn't have and a provider the workspace doesn't have shall each be a `not_found` error with a fix.

## Examples

- Given `providers/ollama.yaml` with `type: ollama` and no `baseUrl`,
  when a call goes to it,
  then it goes to `http://localhost:11434/v1/chat/completions` without a key.
- Given `providers/acme.yaml` with `type: acme-cloud`,
  when a call needs it,
  then the error says provider acme has type acme-cloud, which Halonic can't call, and names the types it can.
- Given an agent `writer` with `model: smart` and the alias `smart` falling back to `fast`,
  when `writer`'s run calls its model,
  then the model is `smart`'s, with its provider's secret name and price, and `fast` as its one fallback.
- Given a call with the alias `fast` for the same agent,
  when the model is picked,
  then it is `fast`.
