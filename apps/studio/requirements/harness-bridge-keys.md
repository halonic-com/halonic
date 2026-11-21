# studio.harness-bridge-keys

- Status: active
- Since: unreleased
- Source: HAL-12488 (plan approved by Liam in HAL-12505, decision (a)), as `cli.harness-model-access` does it for the CLI

When the Studio's engine opens a harness agent's bridge on the agent host, and the agent's file names as its `model` an alias its hub can use, the bridge shall serve that alias's keyed provider (requirement `cli.harness-model-access`) on the one bridge route its API is served on, and no other route: the key by its secret name, the provider file's id, its `baseUrl` when it names one, the alias's model id as the only model the key is spent on, and the alias's price under that route and model id. The engine shall ask the program for the alias's model id. The workspace's files shall be read as they are saved now, and before the key is named, the check of `cli.harness-model-access` shall run with the harness the agent's call runs in, whether a person trusted exactly those files, and the addresses the keychain allows for each key; a refusal shall fail the run with its error. Any other harness agent shall keep the program's own sign-in for both routes.

A bridge shall read from the keychain only the key its own access names, and never a key of Halonic's own or a plugin's. The agent host shall take the access's `baseUrl` and provider id, and reach a `baseUrl` through an HTTP client that checks its address as a connector's is, where a name may not resolve onto the person's own network; Anthropic's and OpenAI's own hosts keep a client that may reach nothing else.

## Examples

- Given the coder agent with `harness: claude-code` and `model: open-coder-agent`, an alias for `zai`'s `glm-5.3` at `https://api.z.ai/api/anthropic` with secret `zai-key`, in a trusted workspace,
  when its bridge opens,
  then the agent host is asked for `anthropic` with the key `zai-key`, provider `zai`, that `baseUrl` and the models `glm-5.3` only, prices `glm-5.3` at the alias's price, and the bridge's ask for `zai-key` gets the keychain's key.
- Given the same agent in a workspace that isn't trusted,
  when its bridge opens,
  then the run fails with `untrusted-provider-address`, and the key is never named.
- Given the same agent in a trusted workspace, and `zai-key` saved with only `https://open.bigmodel.cn` as its allowed address,
  when its bridge opens,
  then the run fails with `key-origin-not-allowed`, and the key is never named.
- Given the same alias on an agent whose call runs in Codex,
  when its bridge opens,
  then the run fails with `not-for-harness`, naming Codex, `zai` and its type `anthropic`, before the program starts.
- Given an agent with `model: sonnet`, which is no alias,
  when its bridge opens,
  then both routes use the program's own sign-in.
- Given a key in the keychain that the bridge's access doesn't name,
  when the bridge asks for it,
  then it gets nothing.
