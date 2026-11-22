# Decision: a stale `--fingerprint` refusal shows the off-here check, and a run names a plugin part's plugin by its name

- Task: HAL-15865, from flow check C642 #1 to #4 on HAL-15857
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-15865 (fixes that make approved command output say what the approved question and `plugin list` already say, so a team decision under the HAL-2282 rule; Liam's code review signs this note)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:e/jTQL/ms6+GOkrASC+oH8jJdCC7c5vU6mQpzeL30AARDTO0LUL+B05AWtK8crmWnqqG2Ichs+uWzWTT4kp6Bw==

## What changes

- `cli.commands.plugin.off-here` (edited): when `halonic trust --plugin <id>` refuses a `--fingerprint` that isn't the plugin's current one, its check is the question's: "Trust *Name*?" for a plugin whose backend stays off on this computer, then "! Trusting *Name* won't turn it on: …" with the reason and where to allow it, then "✕ That fingerprint doesn't match *Name* as it is now." Before, the check was built before `offHereFor` and started "Trust *Name* and turn it on?". The sentence and an example are added; nothing is taken out. The check now also has the Programs and "Copied from" lines the question shows, since one helper (`pluginCheckAsAsked`) builds both.
- `cli.plugin-local-tools` (edited): the warning for a part of a plugin that didn't start names the plugin by its manifest's name, as `plugin list` does: "! The backend of the plugin Weather didn't start, …", not "weather". The plugin connector passes the name on with the part it reports (`PluginPartUnavailable.name`, optional, so a report without it falls back to the id). The example now says "Files", the name of the test's plugin `files`.

## Why

C642 #4: after a changed file, the refusal promised to turn on a plugin that stays off here, while the command it gives then says it is trusted but off. C642 #6: #4787 named a stopped plugin by its name, and the part warning still named it by its id.

## Docs

`apps/cli/README.md` says the question for an off-here plugin and the desktop app's Settings › Plugins › *Name* › Review path the CLI prints; the plugins guide quotes what a run prints for a stopped plugin.

## Covers

- cli.commands.plugin.off-here
- cli.plugin-local-tools
