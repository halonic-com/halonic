# studio.harness-provider-key

- Status: active
- Since: unreleased
- Source: HAL-13795 (plan and Liam's changes approved on HAL-13795; the CLI's rules from HAL-12784, `cli.harness-provider-key`, and for aliases HAL-12488)

When a sandboxed harness agent's bridge opens in the agent host, Studio shall serve it the provider access `ProviderKeyServices` decides (`harness-host.provider-key-services`), on the workspace the engine loaded, the keychain and the engine's own check before a model call sends a key, bound to the workspace's trust and the keys' allowed addresses, and so is the engine's check of an agent whose `model` is an alias. The key's value shall never go to the host with the bridge: the host reads it from Studio only when a call needs it, and only a secret a provider file names. Before the bridge opens, and so before the program starts, Studio shall stop the run:

1. when the provider has its own address (`baseUrl`), which the agent host's bridge can't reach yet, saying so and that `halonic run` or a provider without its own address works, without reading the key;
2. when the engine's check refuses the key's address, with the check's message and its fix;
3. when the key's secret holds no value, saying it isn't saved on this computer and to save it in Settings › Models.

The bridge shall name the providers it reaches with a key in its `keyProviders`, so Claude Code gets its stand-in key, and a `bridge.failed` from the host shall lose every key value Studio handed out before the run log records it. An agent on this computer keeps the program's own sign-in.

## Examples

- Given a workspace with an Anthropic provider `claude` whose secret `anthropic-key` is saved, and a sandboxed Claude Code agent,
  when its bridge opens,
  then the host is sent the secret's name and no value, the bridge names `anthropic` in its `keyProviders`, and the host gets the key when it asks for `anthropic-key`.
- Given the same agent whose key's secret holds no value,
  when its run starts,
  then it stops with "The secret "anthropic-key" that holds provider claude's key isn't saved on this computer, so the sandboxed agent can't call its model. Save it in Settings › Models.", and no bridge opens, so the program never starts.
- Given a provider `zai` with its own address,
  when a sandboxed agent's run on it starts,
  then it stops saying Studio can't send its calls to that address yet, and the key is never read.
- Given a key the bridge read,
  when the host reports a failure whose message quotes it,
  then the run log records it with the key removed.
- Given an agent set to "On this computer",
  when its bridge opens,
  then it keeps the program's own sign-in and no key is read.
- Given an alias `open-coder` of provider `zai`'s model `glm-5.3`, which has its own address,
  when the engine's alias check is asked in a workspace that isn't trusted,
  then it refuses, and in a trusted one it names `zai`.
