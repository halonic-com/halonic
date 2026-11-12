# services.shell-host-settings

- Status: active
- Since: 0.1.0
- Source: HAL-6261 (PR 7d of the settings host API, design on HAL-6159, section 5)

When the Studio runs in the desktop shell, a workspace's services shall have the settings kept where Halonic runs as a `HostSettingsStore`, through the Tauri host settings store, so the CLI and every window read and save the same `settings/host.json` in the profile. Outside the shell they shall provide none, and say so, so the app can provide another store.

## Examples

- Given a page in the shell,
  when a workspace opens and the turn limit 20 is saved through its `HostSettingsStore`,
  then the shell receives `host_settings_set`, and a read gives the turn limit 20.
- Given a page opened in a browser,
  when a workspace opens,
  then no `HostSettingsStore` is provided.
