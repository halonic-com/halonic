# harness-host.provider-key-services

- Status: active
- Since: unreleased
- Source: HAL-13795 (plan and Liam's changes approved on HAL-13795; the CLI's rules from HAL-12784 and, for aliases, HAL-12488)

`ProviderKeyServices` shall be what the CLI and the Studio serve each harness agent's bridge: the access `providerAccessOf` (`harness-host.provider-access`) decides from the workspace's provider files, with the provider's `baseUrl`, and the prices of the chosen provider's models. Its `bridgeSecrets` shall answer only the secrets a provider file of the workspace names and remember every value it hands out, so its `scrub` removes them from a text. For a key, before the bridge opens, it shall run the app's own check that the key may go to the provider's address, and, when that check refuses, stop with the check's message and its fix in one text, of the check's kind, so a run log that keeps only the message still says what to do. It shall then stop with an `invalid_input` error in the app's own words when the key's secret holds no value. For an agent whose `model` is an alias, it shall first run the app's alias check, before any key is read, and serve the alias's provider's key wherever the agent runs, with the alias's model as the only one the key pays for. It never decides trust itself: the app binds both checks to its own trust and key origins. The bridge host shall give the engine the providers the bridge server says it reaches with a key (`keyProviders`, `harness-bridge.key-providers`), so the harness's environment gives a program such as Claude Code its stand-in key and it doesn't run signed out.

## Examples

- Given a provider `claude` with the secret `anthropic-key` and a secret `github-token` no provider file names,
  when the bridge asks for each,
  then it gets the key for `anthropic-key`, nothing for `github-token`, and the scrub removes the key from a text.
- Given a sandboxed Claude Code agent and an app check that refuses with a message and a fix,
  when its services are asked for,
  then they stop with the message followed by the fix, of the check's kind, and the secret is never read.
- Given a sandboxed Claude Code agent whose key's secret holds no value,
  when its services are asked for,
  then they stop with the app's words for a missing key.
- Given a sandboxed Claude Code agent whose key is saved and may go,
  when its services are asked for,
  then the bridge gets the key's secret name, provider id and `baseUrl`, and the app's check got that provider's file.
- Given an agent on this computer whose `model` is the alias `careful` of provider `claude`'s model `acme-model`,
  when its services are asked for,
  then the app's alias check runs before the secret is read, and the bridge gets `claude`'s key for `acme-model` only.
- Given a bridge server that reaches Anthropic with a key Halonic keeps,
  when the engine opens a bridge,
  then the bridge it gets names Anthropic in its `keyProviders`.
