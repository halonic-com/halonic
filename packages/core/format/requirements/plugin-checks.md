# format.plugin-checks

- Status: active
- Since: 0.1.0
- Source: HAL-1734, the plugins ADR (`docs/adr/2026-11-09-plugins.md`, Accepted, sections 1.1, 1.4 and 1.5)

When a `plugin.yaml` passes its schema, the format shall fail it unless it has a `backend` or `localTools`, its backend passes the integration sheet's own checks and doesn't need `process`, no local tool id, tool name within one local tool, command id or card id is listed twice, no tool name and no secret name is in two parts, every local tool `env` secret names one of that tool's own secrets, every `env` setting names a setting that isn't a `secret` field, every local tool secret goes only to hosts in that tool's `network`, every `secret` field names a secret the backend or a local tool declares, every choice's `default` is one of its `choices`, every command and card names a tool the plugin declares, and a plugin with cards has a panel; and `backendSheet` and `pluginFromIntegrationSheet`, offered by the main entry point and by `@halonicjs/format/integration`, shall convert between a plugin's backend and an integration sheet without losing anything.

## Examples

- Given the weather plugin from the ADR, when it is parsed, then it passes with no problem.
- Given a plugin with only `id`, `version`, `sdk` and `name`, or with only `ui`, when it is parsed, then it fails with `no-part` at the root.
- Given a backend secret for a host the backend doesn't declare, when it is parsed, then it fails with `secret-host-not-declared` under `backend`, as an `integration.yaml` would.
- Given a backend with `needs: [process]`, when it is parsed, then it fails with `needs-process` at `backend.needs.0`, with a message that points to `localTools`.
- Given a local tool id, a tool name in one local tool, a command id or a card id listed twice, when it is parsed, then it fails with `duplicate` at the second one.
- Given the tool name `forecast` in the backend and in a local tool, when it is parsed, then it fails with `tool-twice` at the local tool's tool; the secret name `example-key` in both fails with `secret-twice`.
- Given a local tool whose `env` takes a secret only the backend declares, when it is parsed, then it fails with `secret-not-declared`; a setting that isn't in `ui.settings` fails with `setting-not-found`, and a `secret` field taken as a setting fails with `secret-as-setting`.
- Given a local tool secret for a host outside its `network`, or for a host from a setting, when it is parsed, then it fails with `secret-host-not-declared` at that host.
- Given a `secret` field whose `secret` no part declares, when it is parsed, then it fails with `secret-not-declared`.
- Given a choice setting or form field whose `default` isn't one of its `choices`, when it is parsed, then it fails with `default-not-a-choice`.
- Given a command or card whose tool neither the backend nor a local tool declares, when it is parsed, then it fails with `tool-not-found` at its `tool`.
- Given cards and no `panel`, when it is parsed, then it fails with `cards-need-panel` at `ui.cards`; commands without a panel pass.
- Given each of the `knowledge-mcp`, `model-gemini`, `tool-google-drive` and `tool-google-gmail` sheets, when `pluginFromIntegrationSheet` converts it, then the plugin is named by the sheet's id, has an empty description and the default `entry` unless the loader gives one, passes `checkPlugin`, and `backendSheet` gives back a value deep-equal to the sheet.
- Given a plugin with no backend, when `backendSheet` reads it, then it gives `undefined`.

## Deliberate limits in v0.1

- A local tool gets only its own secrets, never the backend's or another local tool's, so a secret reaches only the program it was declared for. Secret names are unique across parts, so a `secret` field fills exactly one.
- A local tool's `network` has only fixed hosts, so its secrets do too; a host from a setting is the backend's way.
- Whether the backend's code matches its sheet needs the code. The integration kit checks it when the plugin loads (`integration-kit.plugin-backend`), not here.
