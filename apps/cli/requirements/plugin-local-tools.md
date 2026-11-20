# cli.plugin-local-tools

- Status: active
- Since: unreleased
- Source: HAL-12343 (wiring a plugin's local tools into the `halonic` command, PR 4c; no silent run when a part can't start, HAL-12637 P17); the plugins ADR (`docs/adr/2026-11-09-plugins.md`), sections 1.4 and 4

When a run's hub names a connector with the `plugin` transport, the `halonic` command shall offer the tools of the plugin's local tools along with its backend's, through one connector (`app.plugin-connector-opening`). Each local tool shall start in a sandbox session of its own at the first listing or call that needs it, from a copy of the files the person trusted, with Halonic's profile folder and the person's credential folders denied, and with only that plugin's own secrets and settings. Each connector a run creates shall get its own session setups. When a part of the plugin can't start, the command shall warn, with or without `--debug`, naming the part, the plugin and why, once for each connector, part and reason, and the plugin's other parts shall keep working. A session that didn't open shall leave none of its folders behind, and when a session's folders can't be removed, the command shall write a `--debug` line.

## Examples

- Given a plugin with one local tool, on a computer where the sandbox can't start,
  when a run lists the plugin's connector,
  then the listing fails, the command is told the local tool is `sandbox-unavailable` with the sandbox's reason, and no session folder is left.
- Given a part reported twice for the same connector and reason,
  when the command warns,
  then it writes `! The tools of the program lister of the plugin files are off for this run: the sandbox can't start on this computer (bubblewrap-missing).` once.
