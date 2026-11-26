# studio.quick-ask-settings

- Status: active
- Since: unreleased
- Source: HAL-18960 (plan on HAL-18625, place agreed on HAL-19262); the row in `feedback.settings-quick-ask`

When the desktop app opens a folder in Studio's own main window, it shall give Settings quick ask's keys, read through the shell's `plugin:quick-ask|shortcut` and changed through `plugin:quick-ask|shortcut_set`, with the window's keyboard platform. When the shell refuses a change with `taken`, `invalid`, `wayland`, `unavailable` or `failed`, the keys settings shall answer with that refusal, and they shall throw any other failure. If the shell reads keys that aren't a shortcut with one of the states `on`, `taken`, `wayland` and `unavailable`, the keys settings shall throw. While the page is in any other window, or in the served Studio, the app shall give no quick ask keys.

## Examples

- Given the main window,
  when Settings saves Ctrl+Alt+K,
  then the shell gets `plugin:quick-ask|shortcut_set` with `{ "shortcut": "Control+Alt+KeyK" }`.
- Given the shell answers `wayland`,
  when Settings saves keys,
  then the answer is `wayland`.
- Given quick ask's own window,
  when it opens a folder,
  then no quick ask keys are given.
