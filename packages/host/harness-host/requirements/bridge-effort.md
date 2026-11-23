# harness-host.bridge-effort

- Status: active
- Since: unreleased
- Source: HAL-16735 (D38 on HAL-16520: per-model effort for harness runs, set in the agent's files)

When the bridge host opens a harness run's bridge, it shall tell the host's `servicesFor` the agent file's `params.reasoningEffort`, when the file sets one. `ProviderKeyServices` shall then give the access to the provider the harness calls, whether a key or the program's own sign-in, the `efforts` the bridge sets (requirement `harness-bridge.effort`): one entry, for the model the program is asked for, which is the alias's provider model id for an alias and the agent's `model` as written for any other name. The effort is the agent file's `params.reasoningEffort`, else its alias's, as the built-in loop lays them. When neither sets one, or the agent names no model, the access shall have no `efforts`, so the program's own effort stays.

## Examples

- Given the alias `cheap` for `acme-flash` with `params: { reasoningEffort: low }`, and an agent whose `model` is `cheap`,
  when its bridge's services are asked for,
  then its access has `efforts: { "acme-flash": "low" }`.
- Given the same alias and an agent file with `params: { reasoningEffort: high }`,
  when its bridge's services are asked for,
  then its access has `efforts: { "acme-flash": "high" }`.
- Given an alias that sets no effort and an agent file that sets none,
  when its bridge's services are asked for,
  then its access has no `efforts`.
- Given an agent on this computer whose `model` is `claude-haiku-5-5`, no alias, with `params: { reasoningEffort: low }`,
  when its bridge's services are asked for,
  then it gets the program's own sign-in with `efforts: { "claude-haiku-5-5": "low" }`.
