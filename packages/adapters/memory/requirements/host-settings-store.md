# memory.host-settings-store

- Status: active
- Since: 0.1.0
- Source: HAL-6159 (the settings host API); `HostSettingsStore` port v1

The memory store of the settings kept where Halonic runs shall keep them as JSON text, so that every read gives a fresh copy. A store made with another one shall share its settings and its watchers, the way two windows on one computer share the profile. For tests, `damage()` shall make the settings unparsable and tell the watchers, after which `read` gives none saved.

## Examples

- Given two stores, the second made with the first,
  when the second saves a turn limit of 20,
  then the first reads it and its watcher is called once, and a new store of its own reads nothing.
- Given a saved turn limit,
  when `damage` is called,
  then `read` gives an empty object and the watcher is called once.
