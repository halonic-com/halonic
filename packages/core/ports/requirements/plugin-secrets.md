# ports.plugin-secrets

- Status: active
- Since: 0.1.0
- Source: HAL-1737 (P4); the plugins ADR (`docs/adr/2026-11-09-plugins.md`), section 3; the counterpart of `ports.workspace-secrets`

The ports package shall export `pluginSecrets`, a view of a `Secrets` store for one plugin's backend. When the name, compared in `secretKey` form, starts with `plugin__<id>__` for that plugin's id, its `get` shall give what the store gives. For any other name, a workspace's secret, one of Halonic's own, a token or another plugin's, its `get` shall throw a `RangeError` with a fixed message that doesn't repeat the name, and shall not ask the store. The integration kit shall read the secrets of a plugin's backend only through it, and a workspace's picks only through `workspaceSecrets`.

## Examples

- Given the plugin `weather` and `plugin__weather__acme-key` or `Plugin__Weather__Acme_Key`,
  when the view's `get` is called,
  then it gives what the store gives.
- Given the plugin `weather` and `openai-key`, `token-key`, `halonic_token_google_refresh` or `plugin__rain__acme-key`,
  when the view's `get` is called,
  then it throws `RangeError("A plugin can read only the secrets stored for it.")` and the store is not asked.
- Given the plugins `a` and `a-b`,
  then the view for `a` refuses the secrets of `a-b`, and the view for `a-b` refuses the secrets of `a`.
