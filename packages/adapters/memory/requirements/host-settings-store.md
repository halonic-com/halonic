# memory.host-settings-store

- Status: active
- Since: 0.1.0
- Source: HAL-6159 (the settings host API); `HostSettingsStore` port v1; review on HAL-6216

The memory store of the settings kept where Halonic runs shall keep them as the text `host.json` would hold, written with `changeSavedHostSettings` and read with `readSavedHostSettings`, so that every read gives a fresh copy, and shall keep the broken copy the way `host.json.broken` would. A store made with another one shall share its settings and its watchers, the way two windows on one computer share the profile. For tests, `savedText()` and `brokenText()` shall give the two texts, and `writeText(text)` shall replace the saved text and tell the watchers.

## Examples

- Given two stores, the second made with the first,
  when the second saves a turn limit of 20,
  then the first reads it and its watcher is called once, and a new store of its own reads nothing.
- Given a saved turn limit of 20,
  then `savedText()` holds `{ "version": 1, "values": { "assistant.turn-limit": 20 } }`.
- Given saved text replaced with `{`,
  when the turn limit is removed,
  then `read` gave an empty object, the watcher was called once and `brokenText()` gives `{`.
