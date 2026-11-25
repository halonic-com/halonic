# app.plugin-build

- Status: active
- Since: unreleased
- Source: HAL-17950 plan rev 1 (the plugin builder), with Liam's conditions on HAL-17985 the runtime contract from HAL-17949, and HAL-18153 (templates)

When the plugin build service builds a workspace's plugin, it shall make the plugin id from the workspace's id, the snapshot from the workspace's tools and templates at its commit (no `templates` list when it has none), and an archive of exactly the four fixed files: `package.json` and `manifest.js` written from checked data, the runtime's worker copied byte for byte, and the snapshot. The manifest's capabilities and settings shall come only from the runtime: its own capabilities plus those of each action the tools use. With a previous build it shall check that build's release file and archive first, refuse one of another plugin, list what changed since it and raise its minor version; without one every tool is added and the version is `0.1.0`; a version asked for wins. It shall refuse to build, with nothing built in part, when loading the workspace found errors, when the workspace isn't a git repository or has no commit, when its commit doesn't hold a file the build read as it is, when the workspace's id gives no valid plugin id, when the snapshot check refuses a tool, when a tool's action isn't available in the runtime, or when the previous build or the version is refused. It shall reach no disk, network or Paperclip, so the same request always gives the same bytes.

## Examples

- Given the same workspace and runtime twice, when each is built, then the two archives and release files have the same bytes.
- Given the templates `task` and `pr-body`, when the plugin is built, then its snapshot lists both, sorted by id, with their titles and text.
- Given a tool file that differs from the workspace's commit, when the plugin is built, then it is refused naming the file.
- Given a tool whose action the runtime lists as not available, when the plugin is built, then it is refused naming the tool and its action.
- Given a tool whose description holds a value that looks like a key, when the plugin is built, then it is refused with the snapshot's problem.
- Given a previous build of version 0.3.0 without the tool `merge_times`, when the plugin is built with it, then the version is 0.4.0 and `merge_times` is listed as added.
- Given a previous build of `halonic-ws.other`, when `acme`'s plugin is built against it, then it is refused.
