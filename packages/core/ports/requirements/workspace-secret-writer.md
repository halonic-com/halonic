# ports.workspace-secret-writer

- Status: active
- Since: unreleased
- Source: HAL-14995 (Liam's decision, option 1: a connector's secret set from Studio)

The ports package shall export `workspaceSecretWriter`, the writing side of `workspaceSecrets`, for a store a workspace's secrets are written to, with `set`, `remove` and `has`. When the name is one of Halonic's own secrets or starts with the token prefix, as `workspaceSecrets` decides, each of the three shall throw `RangeError("A workspace can't pick a secret that belongs to Halonic.")` and shall not ask the store; when the name starts with the plugin prefix `plugin__`, compared in `secretKey` form, each shall throw `RangeError("A workspace can't pick a secret that belongs to a plugin.")` and shall not ask the store. For any other name each shall do what the store does. `has` shall say only whether a value is stored, never the value.

## Examples

- Given `serve-password` or `Halonic-Token-google_refresh`,
  when a workspace writer's `set`, `remove` or `has` is called,
  then it throws the Halonic refusal and the store is not asked.
- Given `plugin__weather__acme-key`,
  when a workspace writer's `set` is called,
  then it throws the plugin refusal and the store keeps the plugin's value.
- Given `NOTES_TOKEN`,
  when a workspace writer sets it, asks `has` and removes it,
  then the store saves the value, says it is set, and removes it.
