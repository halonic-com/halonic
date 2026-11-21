# app.stores-pass-left-out

- Status: active
- Since: unreleased
- Source: HAL-13334 plan (a store that wraps the workspace's store passes the `DefinitionStore` port's `leaveOut` on, or it quietly lists everything again)

When the reviewing store or Try it's source is given `leaveOut` in `list()` or `version()`, it shall pass it on to the workspace's store and leave out the same files the store leaves out. Try it's source shall not count a held-back file that `leaveOut` leaves out in its version.

## Examples

- Given a workspace holding `workspace.yaml` and `repo/src/a.ts`,
  when the reviewing store lists it with `leaveOut: { folders: ["repo"] }`,
  then it gives `["workspace.yaml"]`.
- Given the same workspace,
  when Try it's source is asked for its version with `leaveOut: { folders: ["repo"] }`,
  then the workspace's store is asked for its version with the same `leaveOut`.
