# cli.workspace-models

- Status: active
- Since: 0.1.0
- Source: HAL-3814 (plan for `halonic run`, PR B, approved by Liam on HAL-3895)

The CLI shall turn a workspace's provider file into a model provider by its type: `mock` into the mock model; `anthropic` into Anthropic's Messages API; `openai`, `openai-compatible`, `ollama` and `lmstudio` into OpenAI's chat completions API. A provider without `baseUrl` shall use Anthropic's or OpenAI's own address, or the default address `doctor` shows for `ollama` and `lmstudio`. The key shall be read for each call from the secret the file names, through the workspace's view of the secrets, and a key that isn't set shall fail the call with `no-key`. A type the CLI has no adapter for, and an `openai-compatible` file without `baseUrl`, shall be a `not_found` error with a fix.

The CLI shall pick a model call's model from the agent editor's unsaved settings when the call has them, else from the call's alias, else the agent's `model`, else the hub's default model, else the workspace's. It shall resolve the name through the aliases the hub can use, or as `provider/model`, and give the model its provider, alias, secret name, price, its alias's `params` (left out when the alias sets none; the engine lays the agent's over them, requirement `engine.model-params`), whether it runs on this computer (always for the mock model) and its alias's fallbacks, each with its own alias's `params`. An alias the hub doesn't have and a provider the workspace doesn't have shall each be a `not_found` error with a fix.

The CLI shall send a provider's stored key (its file's `secret`) to an address other than its type's own only when the workspace is trusted on this computer, for every model call: the workspace's providers, and the agent editor's unsaved settings. An address is the type's own when `baseUrl` is left out or has the same scheme, host and port as it; `anthropic` has `https://api.anthropic.com`, `openai` `https://api.openai.com`, `ollama` `http://localhost:11434` and `lmstudio` `http://localhost:1234`. A type with no address of its own, another scheme, host or port, an IP address, a look-alike host, an address with user info and an address that doesn't parse shall each count as not the type's own. An untrusted workspace, or a trust check that fails, shall fail the call with the `denied` error `untrusted-provider-address`, which names the provider and the origin, never the key or the path. The trust check shall list a provider whose key goes to another address with the line "Sends its key to" and the origin (HAL-11342).

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
- Given `smart` with `params: { temperature: 0.2 }` and `fast` with `params: { maxTokens: 300 }`,
  when `writer`'s model is picked,
  then it has `smart`'s params, and its fallback `fast` has `fast`'s.
- Given `providers/crm.yaml` with `type: openai-compatible`, `baseUrl: https://llm.example.com/v1` and a `secret`, in a workspace that isn't trusted,
  when a call goes to it,
  then it fails with `untrusted-provider-address`, naming provider crm and `https://llm.example.com`, and nothing is sent.
- Given a call with the alias `fast` for the same agent,
  when the model is picked,
  then it is `fast`.
