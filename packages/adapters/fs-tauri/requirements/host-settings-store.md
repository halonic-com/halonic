# fs-tauri.host-settings-store

- Status: active
- Since: 0.1.0
- Source: HAL-6261 (PR 7d of the settings host API, design on HAL-6159, section 5); `HostSettingsStore` port v1; `contracts.host-settings-store`

The Tauri host settings store shall implement `HostSettingsStore` by calling the shell's `host_settings_read`, `host_settings_set` and `host_settings_remove` commands with the key and the value as given, and shall never send a path. It shall refuse a key `isHostSettingKey` refuses, a number that isn't finite, and a value over `hostSettingsMaxBytes` with a `RangeError` before it calls the shell, which would get a number that isn't finite as `null`. When the shell refuses a key or a size, it shall reject with a `RangeError`; when the shell can't read `host.json`, with an `Error` that keeps the shell's message; an `io` refusal with an `unavailable` error that keeps the shell's message; and a rejection that isn't the shell's refusal shape, such as a page without the `desktop-host-settings` capability, or an answer that isn't the settings, with an `unavailable` error that doesn't repeat its text.

`watch` shall read the settings once when it starts, then every 2 seconds while it is open and right after each save through the store, and call the listener only when the settings differ from the last read, compared as canonical JSON. A read that fails shall be told once, as a change. A save that lands while a read is under way shall be followed by another read. After the returned stop function, it shall read nothing more and never call the listener.

## Examples

- Given a watch,
  when the CLI saves the turn limit 20,
  then the listener is called within 2 seconds, once; when the same settings are written again with the keys in another order, it isn't.
- Given a watch,
  when the page saves the turn limit 20 through the store,
  then the listener is called without waiting for the next read.
- Given the served Studio, which has no `desktop-host-settings` capability,
  when any method is called,
  then it rejects with an `unavailable` error that doesn't hold the shell's text.
- Given `NaN` for the turn limit,
  when it is saved,
  then it rejects with a `RangeError` and the shell gets no call.
