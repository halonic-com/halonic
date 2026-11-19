# Decision: a plugin can't be added from a folder that overlaps Halonic's own data

- Approval: Paperclip task HAL-13713; Liam approves this note in review
- Kind: internal

`plugin add` copied any folder it was given. A folder that is, holds or is inside the profile folder or a workspace's `.studio` data would put Halonic's own records into a plugin's copy.

- `PluginService.add` refuses such a source as `halonic-data`, before reading anything. It checks the source's real location, so a link into the profile is refused too.
- The host names its data folders, each as written and with links resolved (`halonicData`). The CLI names the profile folder and the `.studio` folder in the folder it runs in, when there is one. A source that is or is inside any workspace's `.studio` is refused without being named.
- Paths are compared as Windows reads them, on every system, by one function in `@halonicjs/std` (`std.path-overlap`). `pathsOverlap` in `@halonicjs/adapter-system-node` now uses it, so the sandbox and plugin add can't drift.
- The CLI says the folder "is, holds or is inside Halonic's own data". Studio rejects with the same reason, so its dialog shows it as any other refusal. Studio's shell already refuses a pick that is or is inside the profile; refusing one that holds it there follows in its own pull request.

## Covers

- app.plugin-add
- cli.commands.plugin.add
