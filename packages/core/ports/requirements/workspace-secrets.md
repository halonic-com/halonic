# ports.workspace-secrets

- Status: active
- Since: 0.1.0
- Source: HAL-2926, from the security check in HAL-2923

The ports package shall export `workspaceSecrets`, a view of a `Secrets` store for the names a workspace picks. When the name is one of Halonic's own secrets (`token-key`, `serve-password`) or starts with the token prefix `halonic_token_`, compared in `secretKey` form, its `get` shall throw a `RangeError` with a fixed message that doesn't repeat the name, and shall not ask the store. For any other name it shall give what the store gives. The integration kit shall read a provider's chosen secrets, and the engine's model chain a model's secret, only through it.

## Examples

- Given `token-key`, `Token_Key`, `SERVE-PASSWORD` or `Halonic-Token-google_refresh`,
  when a workspace view's `get` is called,
  then it throws `RangeError("A workspace can't pick a secret that belongs to Halonic.")` and the store is not asked.
- Given `openai-key`,
  when a workspace view's `get` is called,
  then it gives the store's value, or `null` when it isn't configured.
- Given a model whose secret is `token_key`,
  when the engine's model chain looks for its key,
  then the turn ends with that `RangeError`.
