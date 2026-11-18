# connector-stdio-sandbox.plugin-local-tool-place

- Status: active
- Since: unreleased
- Source: HAL-12343 (point 2 of the P10 review: where a plugin's local tool runs); the plugins ADR (`docs/adr/2026-11-09-plugins.md`), sections 4 and 6

The `pluginLocalToolPlace` function shall build the place a plugin's local tool runs in from what the host set up: its own new working and temp folders, the session's copy of the plugin's checked files, the paths it denies, the bridge, Halonic's time limit and the host's `PATH`. A script shall read the plugin's copy and nothing else of the plugin, and a pinned package nothing of the plugin. The denied paths shall be the host's, each listed once, and the sites exactly the hosts the tool's config lists, so the network is the bridge and those hosts only. It shall refuse a plugin copy that is the working folder, inside it, or inside a denied path, such as the plugin's own folder in Halonic's data.

## Examples

- Given a script with the site `api.notes.test`,
  when its place is built and its profile with it,
  then the profile reads only the plugin's copy, denies the host's paths, and allows only `api.notes.test`.
- Given a pinned package,
  when its place is built,
  then it has no read-only path.
- Given the plugin's own folder in Halonic's data as the plugin's copy,
  when the place is built,
  then it throws a `RangeError`.
