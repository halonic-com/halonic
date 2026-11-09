# format.plugin-file

- Status: active
- Since: 0.1.0
- Source: HAL-1734, the plugins ADR (`docs/adr/2026-11-09-plugins.md`, Accepted, sections 1 to 1.3)

When `parseFile` reads a `plugin.yaml`, the format shall require an `id` and `version` by the integration sheet's rules, a positive `sdk` and a `name` of up to 80 characters, take a `description` of up to 500 characters that is empty when left out, read `backend` with the integration sheet's own schema without `id`, `version` and `kit`, with an `entry` path inside the plugin folder (default `backend/index.js`) and `provides` defaulting to `[connector]`, read each local tool with exactly one of a package start at an exact version (and an optional https registry) or a script start inside the plugin folder run by `node` or `python`, with `args`, an `env` whose values only name a setting or a secret, `secrets`, `network`, a `callTimeoutMs` of at most one hour (default 60 s) and at least one tool in the sheet's tool shape, read `ui` settings as a map of typed fields, commands with a form map and `show`, cards with fixed arguments and `show`, and at most one panel with only a title, and fail any unknown key at any depth.

## Examples

- Given the weather plugin from the ADR, when it is parsed, then it passes, and the backend's `entry`, `provides`, `tokens` and `needs`, the local tool's `callTimeoutMs`, each field's `required` and each secret's `optional` get their defaults.
- Given a plugin with only `id`, `version`, `sdk` and `name`, when the schema reads it, then it passes with an empty description; requiring a part is a check (`format.plugin-checks`), not the schema's job.
- Given an unknown key at the top, in `backend`, in a local tool, its package or script start, a setting, a command, a card or the panel, when it is parsed, then it fails with `unrecognized_keys` there.
- Given `id`, `version` or `kit` inside `backend`, when it is parsed, then it fails with `unrecognized_keys`: the plugin's own fields give them.
- Given a card with `for`, when it is parsed, then it fails with `unrecognized_keys`: selection cards aren't offered in v0.1.
- Given a local tool start with both a package and a script, or with neither, when it is parsed, then it fails at `start`.
- Given an `npx` or `uvx` version such as `^1.2.3`, `~1.2`, `>=1.0`, `==0.4.1`, `1.x`, `*` or `latest`, when it is parsed, then it fails at `version`; `1.2.3`, `1.2.3-beta.1`, `0.4.1` for `uvx` and `2.0rc1` pass.
- Given a package name that starts with `-`, or a registry that isn't https, when it is parsed, then it fails there.
- Given a script path such as `/bin/sh`, `C:/run.js`, `tools\run.js`, `../run.js`, `tools/../../run.js` or `./run.js`, when it is parsed, then it fails at `path`; a program other than `node` or `python`, such as `bash`, fails at `program`.
- Given an `env` value that is a literal text, or an `env` name in lower case, when it is parsed, then it fails there.
- Given a `secret` field with a `default` or without `secret`, a `number` field with a text default, a `url` field with a `file:` default, or a `choice` field without choices, when it is parsed, then it fails there.
- Given a form field of type `secret`, a card argument that isn't a fixed text, number or true/false value, or a `show` other than `text`, `markdown` or `table`, when it is parsed, then it fails there.
- Given a list of panels, when it is parsed, then it fails at `ui.panel`: a plugin has at most one.

## Deliberate limits in v0.1

- That a script path stays inside the plugin folder once links are followed is checked when the local tool starts (P5, local tools on `Sandbox`), not here.
- A local tool's environment variable names aren't held against the connector port's deny list here; the pin rules of `ConnectorTransport.stdio.pin` apply when the tool starts (P5).
