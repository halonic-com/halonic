# app.plugin-connector

- Status: active
- Since: unreleased
- Source: HAL-12343 (wiring local tools into the apps: one connector for all of a plugin's parts, and no silent run when a part can't start); the plugins ADR (`docs/adr/2026-11-09-plugins.md`), sections 1.4 and 4

The app shall offer a trusted plugin's tools through one connector that joins its parts, its backend and each local tool. Its listing shall hold, for each part that lists its tools, only the tools that part declares in the manifest. Each call shall go to the part that declares the tool, and a call to a tool no part declares shall fail without reaching any part. A part whose listing fails shall leave out only its own tools, and the host shall be told once for that part, with the plugin, the part and a code: the local tool's state (`needs-desktop-app`, `sandbox-unavailable`, `sandbox-not-fenced`, `network-needs-srt`), `settings-not-set` with the settings' names, `not-trusted` with the trust reason, or `failed`. A call that fails because its part can't start shall tell the host the same way, unless that part was already reported; a tool's own error shall not. When every part fails, the listing shall fail with the first part's error. Closing the connector shall close every part, even when one fails to close.

## Examples

- Given a plugin whose backend lists `forecast` and an undeclared `debug`, and whose local tool `files` lists `read-note`,
  when the run lists the plugin's connector,
  then it offers `forecast` and `read-note`, and a call to `read-note` reaches only the local tool.
- Given a plugin whose local tool can't start because this computer has no sandbox,
  when the run lists the plugin's connector twice,
  then it offers the backend's tools, and the host is told once that `local:files` is `needs-desktop-app`.
- Given a plugin with only a local tool, which needs a setting that has no value,
  when the run lists the plugin's connector,
  then the listing fails with that error, and the host is told `settings-not-set` with the setting's name.
- Given a plugin whose backend's call fails with a tool error,
  when the run calls that tool,
  then the call fails and the host is told nothing.
