# cli.commands.build.paperclip-plugin

- Status: active
- Since: unreleased
- Source: HAL-17950 plan rev 1 (the plugin builder), with Liam's conditions on HAL-17985, and HAL-18153 (templates), HAL-18195 (the snapshot's SHA-256); `app.plugin-build`

The `halonic build paperclip-plugin` command shall build a Paperclip plugin of the workspace's tool and template files (`library/templates/<id>.md`, in the snapshot's `templates` list) through the plugin build app service and write `<plugin id>-<version>.tar` and `<plugin id>-<version>.release.json` into `--out` (the current folder by default, made when missing), with exit 0. It shall print the plugin id, version and short commit, then one row each for the plugin file, the release file, the SHA-256, the snapshot's SHA-256 and what changed; with `--json` it shall add the release file's fields and both paths. It shall take the workspace's current git commit, and refuse with exit 5 when the workspace isn't in a git repository, has no commit, or `workspace.yaml`, a tool file or a template file has changes that aren't committed or isn't in the commit. It shall refuse with exit 2 when the workspace has errors, when the service refuses the tools or the previous build, and for a `--plugin-version` that isn't `x.y.z`. `--since <release file>` shall read that release file and the archive it names from the same folder, each size-checked before it is read. It shall leave an identical file already in `--out` as it is, and never overwrite a different one (exit 5). It shall take the worker, actions, capabilities and settings only from the plugin runtime this Halonic ships, and say so when that worker isn't built. It shall never install anything and never reach Paperclip or the network.

## Examples

- Given a committed workspace `acme` with the tool `pr_status`,
  when `halonic build paperclip-plugin --out dist` runs,
  then it writes `dist/halonic-ws.acme-0.1.0.tar` and its release file, and prints "✓ Built halonic-ws.acme 0.1.0 from commit …" and "Changes   added pr_status".
- Given the same workspace built twice,
  when the second build runs,
  then the archive has the same bytes and the command ends with exit 0.
- Given a build 0.3.0 and a committed change to `pr_status`'s description,
  when `halonic build paperclip-plugin --since halonic-ws.acme-0.3.0.release.json` runs,
  then it builds 0.4.0 and prints "Changes   changed pr_status".
- Given a committed template `library/templates/task.md` with the title "Task",
  when the command runs,
  then the plugin's snapshot lists the template `task` with that title and its text.
- Given a tool file changed and not committed,
  when the command runs,
  then it fails with "library/tools/pr-status.tool.yaml has changes that aren't committed." and exit 5.
- Given a tool whose action the runtime can't run yet,
  when the command runs,
  then it fails naming the action and the tool, with exit 2.
