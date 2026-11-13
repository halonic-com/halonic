# memory.sandbox-setting-store

- Status: active
- Since: 0.1.0
- Source: `SandboxSettingStore` port v1; HAL-5392

The memory sandbox setting store shall keep the choice as JSON text, so that every read gives a fresh copy and a choice that isn't exactly a valid one makes `get` throw. For tests, `damage()` shall make the saved choice unreadable, after which `get` throws. `damage` without a saved choice shall throw and create nothing.

## Examples

- Given a saved choice,
  when it is damaged and read,
  then `get` throws.
- Given a saved choice of a backend that `sandboxBackendIds` doesn't list,
  when it is read,
  then `get` throws.
- Given an empty memory sandbox setting store,
  when it is damaged,
  then it throws, and reading still gives `null`.
