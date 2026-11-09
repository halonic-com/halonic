# ports.connection-settings-store

- Status: active
- Since: 0.1.0
- Source: HAL-9 decision 5 and plan v1.7 ("allow sending" per connection, kept in the user's profile), HAL-186 step 7(b) (HAL-1531): the port only stores, `ConnectionSettings` in `core/app` decides

The ports package shall have a `ConnectionSettingsStore` port that gets, saves and removes a connector's settings by workspace location and connector id, where the settings hold the key, whether sending is allowed and the time a person changed them. The port shall only store settings: it shall have no method that decides whether a call may run.

The port's documentation shall state that the settings live in the user's profile and never in a workspace, that settings that can't be read make `get` throw with their key, and that `remove` still deletes them.

## Examples

- Given the `ConnectionSettingsStore` port,
  when its methods are read,
  then they are exactly `get`, `save` and `remove`.
- Given `ConnectionSettingsStore.get`,
  when it is called with a location and a connector id,
  then it returns a `ConnectionSettingsRecord` or `null`.
- Given a `ConnectionSettingsRecord` for the connector `mail`,
  when it is compiled,
  then it compiles; one without `allowSending` or without a connector id doesn't.
