# Decision: the desktop app can add a plugin

- Task: HAL-11571
- Approval: Liam decided on HAL-11571 (https://paperclip.halonic.com/HAL/issues/HAL-11571) that the desktop installer is built for v0.1, in three pull requests. A team decision with no board card; the install flow is already in the approved v0.1 scope (ADR `docs/adr/2026-11-09-plugins.md`, P6 and P7).
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:O9McZ7lC6MunW1pQWKCNV5HV05C9oKcBmrjsRDLZsT5jiNe4SeO+crRn/qxSVCsoUp9Tn1VXoTRM++MqsZ+WCQ==

## What changes

- `fs-tauri.plugin-folder`: the writer's `place` used to reject always, because adding a plugin was a CLI action. It now places a plugin through the shell's `plugin_folder_place`, so that sentence and its example are replaced by a pointer to the new requirement `fs-tauri.plugin-install`. The test "refuses to place a plugin: adding one is a CLI action" is replaced by the tests in `plugin-install.test.ts`, which check that `place` writes through the shell, answers `taken` for a name in use in any case and refuses an unsafe name or path before it calls the shell. No other test of this requirement changes.
- `studio.desktop-plugins-host`: the sentence "The host shall add no plugin: adding stays a CLI action." is removed. The host now has an installer, described by the new requirement `studio.desktop-plugin-installer`. Every other sentence and example of this requirement stays, and its tests are untouched.

## Why

Settings → Plugins was merged without an installer, so the app showed the `halonic plugin add` command instead of an Add plugin button (`plugins.plugin-list-no-installer`). The shell commands that make an installer safe (the folder picker and source reader, the placing, and the git export) are in the two pull requests below this one. This one connects them. Nothing is trusted on install: core's `PluginService.add` reads the source once, checks and hashes it, and the shell places exactly those bytes; the person trusts it afterwards in the dialog that follows.

## Covers

- fs-tauri.plugin-folder
- packages/adapters/fs-tauri/src/plugin-folder.test.ts
- studio.desktop-plugins-host
