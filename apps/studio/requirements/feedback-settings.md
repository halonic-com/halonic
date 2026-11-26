# studio.feedback-settings

- Status: active
- Since: unreleased
- Source: HAL-18972 (plan on HAL-18919); the sections in `feedback.settings-shortcut` and `feedback.settings-section`

When the desktop app opens a folder in Studio's own main window, it shall give Settings the feedback settings over the shell's `plugin:feedback|shortcut_set`, with the window's keyboard platform. When the shell refuses with `taken`, `invalid`, `unavailable` or `failed`, the feedback settings shall answer with that refusal, and they shall throw any other failure. While the page is in any other window, or in the served Studio, the app shall give no feedback settings.

## Examples

- Given the main window,
  when Settings saves Ctrl+Alt+K,
  then the shell gets `plugin:feedback|shortcut_set` with `{ "shortcut": "Control+Alt+KeyK" }`.
- Given the shell answers `taken`,
  when Settings saves a shortcut,
  then the answer is `taken`.
- Given Halonic Inbox's window,
  when it opens a folder,
  then no feedback settings are given.
