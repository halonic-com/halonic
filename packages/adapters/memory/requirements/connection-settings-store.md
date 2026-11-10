# memory.connection-settings-store

- Status: active
- Since: 0.1.0
- Source: HAL-2598; `ConnectionSettingsStore` port v1

The memory connection settings store shall keep each connector's settings as JSON text, so that every read gives a fresh copy. For tests, `damage(key)` shall make the settings for that key unreadable, after which `get` throws an error naming the connector and the location. `damage` on a key without settings shall throw and create nothing.

## Examples

- Given saved settings for `mail` in `/workspaces/acme`,
  when `damage` is called for that key and the settings are read,
  then it throws an error naming `mail` and `/workspaces/acme`.
- Given an empty memory connection settings store,
  when `damage` is called for `mail` in `/workspaces/never`,
  then it throws naming the key, and `get` still gives `null`.
