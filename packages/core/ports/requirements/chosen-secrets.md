# ports.chosen-secrets

- Status: active
- Since: 0.1.0
- Source: HAL-12191, from the notes of HAL-8618: the loader and the host's sign-in must read one mapping, not two copies

The ports package shall export `chosenSecrets`, a view of a `Secrets` store through the secret names a person picked for an integration's sheet. Its `get` of a name the sheet declares shall give what the store holds under the name picked for it, and `null` without asking the store when nothing was picked. The picked name shall be read through `workspaceSecrets`, or through `pluginSecrets` of the plugin's id when one is given, so a pick can't reach Halonic's own secrets, a token or another plugin's. The integration kit's loader and the host's sign-in shall read secrets only through it.

## Examples

- Given the pick `client-secret` → `acme-client`,
  when `get("client-secret")` is called,
  then it gives the store's value of `acme-client`.
- Given the same pick and a name nothing was picked for,
  when `get("other")` is called,
  then it gives `null` and the store is not asked.
- Given the pick `client-secret` → `token-key`,
  when `get("client-secret")` is called,
  then it throws the `RangeError` of `workspaceSecrets` and the store is not asked.
- Given a plugin `weather` and the pick `key` → `openai-key`,
  when `get("key")` is called,
  then it throws the `RangeError` of `pluginSecrets` and the store is not asked.
