# cli.harness-provider-key

- Status: active
- Since: unreleased
- Source: HAL-12784 (plan and Liam's three additions approved on HAL-12784; follows the sign-in decision on HAL-6477)

The CLI's harness host shall serve each harness agent's bridge the access `providerAccessOf` (`harness-host.provider-access`) decides from the workspace's provider files: an agent on this computer keeps the program's own sign-in, and a sandboxed agent calls its model with the key of the chosen provider, which the bridge puts in place of the program's own key. The program shall never see the key's value: not in its environment, its arguments or its files. The bridge shall read keys only through a filter that answers only the secrets a provider file of the workspace names, and every value it hands out shall be remembered, so a failure the bridge reports reaches the run log with the value removed. The key shall go only to the address of the provider it was picked from: its `baseUrl` when the file names one, called through the engine's own HTTP client, else its type's own host. Before the bridge opens, the host shall refuse a key that may not go to that address (a `baseUrl` other than the type's own in a workspace that isn't trusted, or an address the key's allowed addresses don't list) and a key whose secret holds no value, naming `halonic secret set <name>`, so the program never starts without a way to call its model. These checks run once, when the bridge opens, not on every call: a change to the workspace's trust or to the key's allowed addresses during a run applies from the next run. Each keyed model call shall name the provider the key came from in the run log, and with `--debug` the CLI shall name the agent, the provider and the secret, never its value. A sandboxed agent with no provider key shall keep its own sign-in, and the CLI shall warn that it may run signed out and say how to add a key.

## Examples

- Given a provider `claude` of type `anthropic` with the secret `anthropic-key`, its value saved, and a sandboxed Claude Code agent,
  when the agent's program calls its model,
  then the provider gets the key in `x-api-key`, the program's environment and arguments hold only the bridge's address and run token, and the run log names `claude` and never the key.
- Given two Anthropic providers with keys and an agent whose model points to `claude`,
  when the agent calls its model,
  then every call goes to `claude`'s address and none to the other's.
- Given an agent a person set to "On this computer",
  when its bridge opens,
  then it keeps the program's own sign-in.
- Given the secret `anthropic-key` with no saved value,
  when the run reaches the agent,
  then the run fails naming `halonic secret set anthropic-key`, and the program never starts.
- Given a provider reply that breaks with an error quoting the key,
  when the bridge reports it,
  then the run log's `bridge.failed` holds the message with the key removed.
- Given a secret the CLI keeps that no provider file names,
  when the bridge asks for it,
  then it gets nothing.
