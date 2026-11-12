# integration-kit.plugin-secrets

- Status: active
- Since: 0.1.0
- Source: HAL-1737 (P4); the plugins ADR (`docs/adr/2026-11-09-plugins.md`), section 3; the counterpart of the loader's read through `workspaceSecrets`

When the kit loads a plugin's backend (the source says it is one), it shall read the backend's secrets only through `pluginSecrets` for that plugin's id, which is the sheet's id: only `plugin__<id>__<name>` can be read, and a pick of any other name, such as a workspace's secret, one of Halonic's own, a token or another plugin's, shall throw a `RangeError` at the read and ask the store for nothing. A workspace's picks shall still be read only through `workspaceSecrets`, which can't name a plugin's secret.

## Examples

- Given a plugin's backend with `plugin__weather__weather-key` picked for `weather-key`,
  when its secrets are read,
  then it gives the plugin's own value.
- Given a plugin's backend with `openai-key`, `token-key` or `plugin__rain__weather-key` picked for `weather-key`,
  when its secrets are read,
  then it throws `RangeError("A plugin can read only the secrets stored for it.")`.
