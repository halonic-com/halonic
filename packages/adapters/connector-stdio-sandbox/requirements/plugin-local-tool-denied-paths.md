# connector-stdio-sandbox.plugin-local-tool-denied-paths

- Status: active
- Since: unreleased
- Source: HAL-12343; Liam's review of halonic#4304 (a connector on the agent host lasts as long as the host)

When `PluginLocalToolSessions` prepares a session of a plugin's local tool, it shall look up the host's denied paths again for that session, so a credential folder that appeared since an earlier session of the same connector is denied in the new session's profile.

## Examples

- Given a session prepared while the host denies only `data`,
  when the host also denies `.aws` and a second session is prepared,
  then the second session's profile denies `data` and `.aws`, and the first one's still denies only `data`.
