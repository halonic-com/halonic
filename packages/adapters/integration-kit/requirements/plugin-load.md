# integration-kit.plugin-load

- Status: active
- Since: 0.1.0
- Source: HAL-1734, the plugins ADR (`docs/adr/2026-11-09-plugins.md`, Accepted, sections 1.4 and 3)

When a plugin that passed its own checks loads, `pluginLoadProblems` shall report `sdk-version` at `sdk` unless its `sdk` is this Halonic's `integrationVersion`, and, when the backend's code is given, the same differences `declarationProblems` reports for an integration and its sheet (name, version, and each tool's text, arguments, `risk` and `untrusted`), with `id` and `version` at the plugin's own fields and every other path under `backend`, the SDK version reported once, and `backend-not-declared` for a plugin with no backend.

## Examples

- Given the weather plugin and backend code that matches it, when it loads, then there is no problem.
- Given a plugin with `sdk: 2`, with or without backend code, when it loads, then there is one `sdk-version` problem at `sdk`.
- Given backend code named `other` at version `2.0.0`, when it is checked, then there are `name-differs` at `id` and `version-differs` at `version`.
- Given backend code whose `forecast` tool has `risk: write` while the backend says `read`, when it is checked, then there is `tool-differs` at `backend.tools.0.risk`.
- Given backend code that offers a tool the backend doesn't list, when it is checked, then there is `tool-not-declared` at `backend.tools`.
- Given a plugin without a backend, when backend code is checked against it, then there is one `backend-not-declared` problem.

## Deliberate limits in v0.1

- Finding the backend's code at `entry` and running it is P4 (backends in the I5 worker); this only compares code that was found.
- A local tool's own tool list is compared with the manifest when it runs (P5), because an MCP server lists its tools only after it starts.
