# app.plugin-connector-parts-off

- Status: active
- Since: unreleased
- Source: HAL-12343 (from Nina's C54 check on HAL-12637: a run whose plugin had a local tool that couldn't start ended without a word about it)

The connector of a plugin (`app.plugin-connector`) shall give, through `newPartsOff` (`ports.connector-parts-off`), each part the host was told can't start, once, with the part and its code as the reason: the local tool's state (`needs-desktop-app`, `sandbox-unavailable`, `sandbox-not-fenced`, `network-needs-srt`), `settings-not-set`, `not-trusted` or `failed`. It shall give no settings' names, trust reasons or error text, and nothing while every part starts.

## Examples

- Given a plugin whose local tool `files` can't start because programs run only in the desktop app,
  when the run lists the plugin's connector twice and reads `newPartsOff` after each,
  then the first gives `{ part: "local:files", reason: "needs-desktop-app" }` and the second gives nothing.
- Given a call to `read-note` whose part fails with its own error,
  when `newPartsOff` is read,
  then it gives nothing.
- Given a plugin whose parts all start,
  when its connector lists its tools,
  then `newPartsOff` gives nothing.
