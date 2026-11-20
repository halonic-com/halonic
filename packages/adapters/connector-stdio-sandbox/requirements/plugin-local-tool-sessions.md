# connector-stdio-sandbox.plugin-local-tool-sessions

- Status: active
- Since: unreleased
- Source: HAL-12343 (wiring local tools into the apps); the plugins ADR (`docs/adr/2026-11-09-plugins.md`), section 4

The `PluginLocalToolSessions` class shall build each session of a trusted plugin's local tool from the plugin as its trust check read it: a new copy folder, working folder and temp folder; the plugin's checked files copied with `copyCheckedPlugin`; the connector config from `localToolConnectorConfig`, starting a script from the copy; the place from `pluginLocalToolPlace`, with the host's denied paths, bridge, `PATH` and time limit; and the profile from `localToolLaunch`, with the secrets read through `pluginSecrets` for that plugin only. Its `localTools` lookup shall give, for the local tool's connector id, the place that profile was built from, the manifest's declared tools and its `callTimeoutMs`, and `undefined` while the tool has no session. The session's `release` shall remove its three folders and, unless a later session of the same tool replaced it, forget its setup. When a file changed after the check (`PluginFileChangedError`), a required setting has no value (`LocalToolSettingsNotSetError`, naming the settings), the pin is refused, no runner is found or a secret isn't set, it shall start nothing, remove every folder it made, and keep no setup.

## Examples

- Given a trusted plugin whose local tool starts a script,
  when a session is prepared,
  then the config starts the script from the session's copy, and the profile is the one `localToolLaunch` builds from the place the lookup gives.
- Given a prepared session,
  when it is released,
  then its folders are gone and the lookup gives `undefined`.
- Given a second session prepared before the first is released,
  when the first is released,
  then the lookup still gives the second session's place.
- Given a script edited after the trust check,
  when a session is prepared,
  then it fails with `PluginFileChangedError` naming the script, and no folder is left.
- Given a required setting with no value,
  when a session is prepared,
  then it fails with `LocalToolSettingsNotSetError` naming the setting, and no folder is left.
