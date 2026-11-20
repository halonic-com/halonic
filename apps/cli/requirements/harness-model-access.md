# cli.harness-model-access

- Status: active
- Since: unreleased
- Source: HAL-12488 (plan approved by Liam in HAL-12505, decisions (a) and (b) and changes 2 and 3)

When a harness agent's file names as its `model` an alias its hub can use, the workspace's models shall give the host that agent's keyed provider: the bridge route whose API the alias's provider file speaks (`anthropic` for `type: anthropic`, `openai` for `type: openai` and `type: openai-compatible`), the provider file's id, its `secret` and its `baseUrl` when it names one, the alias's model id and the alias's price. Only the alias's own target shall count, never its fallbacks. A name that is no alias of the hub, a name with a `/` included, shall give no keyed provider, so the program signs in itself, and shall go to the program as written.

Before it names the key, it shall run the same check as a model call of the built-in loop: a key goes to an address other than its type's own only in a trusted workspace (`untrusted-provider-address`), and only to an origin its list allows (`key-origin-not-allowed`), and in a workspace that isn't trusted no real provider is called (`untrusted-workspace`). An alias whose provider the workspace doesn't have shall fail with `no-provider`. An alias whose provider's type has no bridge route, or not the route the agent's harness calls (`anthropic` for Claude Code, `openai` for Codex), or whose provider names no secret, shall fail with `not-for-harness`, naming the provider and never a key; for the wrong route it shall also name the harness and the provider's type.

## Examples

- Given `providers/zai.yaml` with `type: anthropic`, `baseUrl: https://api.z.ai/api/anthropic` and `secret: zai-key`, and the alias `open-coder-agent` → `zai/glm-5.3` with a price, in a trusted workspace,
  when a Claude Code agent with `model: open-coder-agent` opens its bridge,
  then its keyed provider is the `anthropic` route, provider `zai`, secret `zai-key`, that `baseUrl`, model `glm-5.3` and the alias's price.
- Given the same files in a workspace that isn't trusted,
  when the agent opens its bridge,
  then it fails with `untrusted-provider-address`, naming `zai` and `https://api.z.ai`, and no key is named.
- Given an agent with `model: sonnet`, which is no alias,
  when it opens its bridge,
  then there is no keyed provider, and the program signs in itself.
- Given the same alias,
  when a Codex agent with `model: open-coder-agent` opens its bridge,
  then it fails with `not-for-harness`, naming Codex, `zai` and `type anthropic`, and no key is named.
- Given an alias whose provider has `type: ollama`,
  when a harness agent with that alias opens its bridge,
  then it fails with `not-for-harness`.
