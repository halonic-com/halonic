# cli.harness-bridge-keys

- Status: active
- Since: unreleased
- Source: HAL-12488 (plan approved by Liam in HAL-12505, decision (a): HAL-6477's "harness agents sign in only" ends for an agent whose `model` is an alias that names a keyed provider)

When the CLI's engine opens a harness agent's bridge, and the agent's file names as its `model` an alias its hub can use, the bridge shall serve that alias's keyed provider (requirement `cli.harness-model-access`) on the one bridge route its API is served on, and no other route: the key by its secret name, the provider file's id, its `baseUrl` when it names one, the alias's model id as the one model the key may be used for (requirement `harness-bridge.keyed-model`), and the alias's price under that route and model id. An alias without a price shall leave its calls unpriced, as the built-in loop's are, so a cost limit or budget doesn't count them. The engine shall ask the program for the alias's model id, and the bridge shall be given the alias from the same version of the files the program's model id was read from. Before the key is named, the check of `cli.harness-model-access` shall run with the command's trust and the key's allowed origins, and a refusal shall fail the run with its error. Any other harness agent shall keep the program's own sign-in for both routes, and the program shall be asked for its `model` as written.

The bridge shall read keys only from secrets that give a key by a name a bridge of this engine was given, and only a name a workspace file may name, so a key the CLI remembers for anything else, Halonic's own and a plugin's included, never reaches it. A compatible provider's `baseUrl` shall be reached through an HTTP client that checks its address as a connector's is, where a name may not resolve onto the person's own network; Anthropic's and OpenAI's own hosts keep a client that may reach nothing else.

## Examples

- Given the coder agent with `harness: claude-code` and `model: open-coder-agent`, an alias for `zai`'s `glm-5.3` at `https://api.z.ai/api/anthropic` with secret `zai-key`, in a trusted workspace,
  when its run starts,
  then the bridge serves `anthropic` with the key `zai-key`, provider `zai`, that `baseUrl` and the model `glm-5.3` only, prices `glm-5.3` at the alias's price, and the program is asked for `glm-5.3` for every call.
- Given the same agent in a workspace that isn't trusted,
  when its run starts,
  then it fails with `untrusted-provider-address`, and the bridge never gets the key.
- Given the same alias, and a commit that changes its model to `glm-5.4` after the program was asked for `glm-5.3`,
  when the agent's bridge opens,
  then the bridge serves `glm-5.3` only.
- Given an agent with `model: sonnet`, which is no alias,
  when its run starts,
  then the bridge serves both routes with the program's own sign-in.
- Given a key the CLI remembers that no bridge was given,
  when the bridge asks for it,
  then it gets nothing.
