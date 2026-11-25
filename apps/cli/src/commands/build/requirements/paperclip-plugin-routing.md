# cli.commands.build.paperclip-plugin-routing

- Status: active
- Since: unreleased
- Source: HAL-18263 (plan HAL-17450 rev 5, "Step 2" and "Safety": the routing file is a trust root); `workspace.routing-file`, `plugin-build.change-list`

When the workspace has a `routing.yaml` at its root, `halonic build paperclip-plugin` shall put its routing in the plugin's snapshot, take it as a file the build read (so a `routing.yaml` with changes that aren't committed is refused with exit 5, as a tool file is), and print the routing entries that changed in the Changes row after the tools, as `routing roles.<role> and areas.<area>`. A `routing.yaml` with an error makes the workspace have errors, so the build is refused with exit 2.

## Examples

- Given the committed `examples/acme` workspace with a `routing.yaml` naming `liam` as code reviewer and `priya` for `engine-and-cli`,
  when `halonic build paperclip-plugin --out dist` runs,
  then the snapshot in the archive holds that routing, the release file's `changes.routing` is `areas.engine-and-cli`, `roles.code-reviewer`, and the Changes row ends with "routing areas.engine-and-cli and roles.code-reviewer".
- Given a `routing.yaml` changed and not committed,
  when the command runs,
  then it fails with "routing.yaml has changes that aren't committed." and exit 5.
