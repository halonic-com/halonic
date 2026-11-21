# cli.plugin-local-tools

- Status: active
- Since: unreleased
- Source: HAL-12343 (wiring a plugin's local tools into the `halonic` command, PR 4c; no silent run when a part can't start, HAL-12637 P17); the plugins ADR (`docs/adr/2026-11-09-plugins.md`), sections 1.4 and 4

When a run's hub names a connector with the `plugin` transport, the `halonic` command shall offer the tools of the plugin's local tools along with its backend's, through one connector (`app.plugin-connector-opening`). Each local tool shall start in a sandbox session of its own at the first listing or call that needs it, from a copy of the files the person trusted, with Halonic's profile folder and the person's credential folders denied, and with only that plugin's own secrets and settings. Each connector a run creates shall get its own session setups. When a part of the plugin can't start, the command shall warn, with or without `--debug`, once for each connector, part and reason (its details included), and the plugin's other parts shall keep working. The warning's first line shall name the part and the plugin in the shape of the other connector warnings ("… didn't start, so its tools are off in this run."), and the lines under it shall say why without a bare reason code: a sandbox that can't start in the words of `run`'s refusal for that code (`other`'s for a code it doesn't know), with the docs line and the code last, and a session the sandbox couldn't confirm in words, with its fence state only under `--debug`. A session that didn't open shall leave none of its folders behind, and when a session's folders can't be removed, the command shall write a `--debug` line.

## Examples

- Given a plugin with one local tool, on a computer where the sandbox can't start,
  when a run lists the plugin's connector,
  then the listing fails, the command is told the local tool is `sandbox-unavailable` with the sandbox's reason, and no session folder is left.
- Given a part reported twice for the same connector and reason,
  when the command warns,
  then it writes `! The program lister of the plugin files didn't start, so its tools are off in this run.` once, with `run`'s line for `bubblewrap-missing` and the docs line under it.
- Given the same part reported again with another sandbox reason,
  when the command warns,
  then it writes the warning again with that reason's line.
