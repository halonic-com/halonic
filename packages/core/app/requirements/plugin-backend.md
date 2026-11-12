# app.plugin-backend

- Status: active
- Since: 0.1.0
- Source: HAL-1737 (P4); the plugins ADR (`docs/adr/2026-11-09-plugins.md`), sections 1.1 and 3; the I5 design 4.2 on HAL-958; Julian's build conditions (a) and (b) in the HAL-1873 design, section 11

When a trusted plugin's backend is about to start in the isolated worker, the restart after an idle stop included, the app shall first read the plugin's folder again as `app.plugin-folder` reads it and check the plugin's trust against what is in it now: the plugin shall be `trusted` for exactly this manifest and these files. Only then shall it start the runner through the start gate, handing the plugin, its location, its files with their hashes and its fingerprint as checked to the start, so the start runs those files and does not read the folder again, which decides again at that start where the code may run, so a saved yes for running without the fence is read at every start and is never part of the plugin's trust. When the folder can't be read, the plugin has no backend, the person never trusted it or took the trust back, a file or the manifest changed since, or the trust record can't be read, it shall throw `PluginBackendNotTrustedError` with the reason (`unreadable`, `no-backend`, `not-trusted`, `changed` or `record-unreadable`) and start no process; any trust status other than `trusted` refuses, so a status added later fails closed. There shall be no start of a plugin's backend outside the gate. On Windows the gate always reports `not-fenced` with `windows`, so a backend starts there only with the person's saved yes. For the loader, the app shall give the plugin's saved setting values as the backend's settings and, for each secret the backend declares, the name it is stored under in `Secrets`, and a declared secret without a stored name is an error, never a fallback to its declared name; the value of a `secret` setting is never among the settings.

## Examples

- Given a plugin the person trusted as it is on disk,
  then its backend's runner starts through the start gate.
- Given a plugin nobody trusted,
  then the start throws `not-trusted` and nothing starts.
- Given a trusted plugin and one byte of `backend/index.js` changed since,
  then the start throws `changed` and nothing starts.
- Given a trusted plugin whose trust the person took back,
  then the start throws `not-trusted` and nothing starts.
- Given a plugin with only a local tool,
  then the start throws `no-backend`.
- Given a trusted plugin started once, and a file changed before the restart,
  then the restart throws `changed`.
- Given a computer in a container with the person's yes for it,
  then the same trust starts the backend without the fence; after Take back, the next start needs the yes again.
- Given Windows, a passing sandbox check and no saved yes for `windows`,
  then the start gives `needs-yes` with `windows`, and nothing starts.
- Given a plugin with the setting `units` and the secret `example-key`,
  then the choices hold the `units` value and `plugin__weather__example-key` for `example-key`.
