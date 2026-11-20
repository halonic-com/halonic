# Decision: a plugin can't be added from a folder that overlaps Halonic's own data

- Approval: Paperclip task HAL-13713; Liam approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:4q4Hrdb1q4BQOREcc5XQqLoVIsjQlfSSXb7sGB+zD2XQ1KmHgb+vM6I84k3XOuJ9KD8lR+p8Gu7NMQm3BcVaBg==

`plugin add` copied any folder it was given. A folder that is, holds or is inside the profile folder or a workspace's `.studio` data would put Halonic's own records into a plugin's copy.

- `PluginService.add` refuses such a source as `halonic-data`, before reading anything. It checks the source's real location, so a link into the profile is refused too.
- The host names its data folders, each as written and with links resolved (`halonicData`). The CLI names the profile folder and the `.studio` folder in the folder it runs in, when there is one. A source that is or is inside any workspace's `.studio` is refused without being named.
- Paths are compared as Windows reads them, on every system, by one function in `@halonicjs/std` (`std.path-overlap`). `pathsOverlap` in `@halonicjs/adapter-system-node` now uses it, so the sandbox and plugin add can't drift.
- `bothSpellings` resolves links with the system's own resolution (`realpathSync.native`), the same one that gives the source's real location. On Windows it expands short names such as `RUNNER~1` too, so the profile's spelling matches the source's.
- The CLI and Studio both say "a plugin can't be added from Halonic's own data, or from a folder that holds it" (wording agreed with design on HAL-13713). A folder inside Halonic's data is that data, so only the folder that holds it is named. Studio's dialog shows it as any other refusal. Studio's shell refuses a pick that is, holds or is inside the profile.

## Covers

- app.plugin-add
- cli.commands.plugin.add
- system-node.path-overlap
