# fs-tauri.definition-store-left-out

- Status: active
- Since: unreleased
- Source: HAL-13334 plan, PR 5

When `list()` or `version()` of the desktop store is given `leaveOut`, the store shall check it as `checkLeaveOut` in `@halonicjs/ports` does and send it to the shell's `fs_list`, whose walk never steps into a left-out folder, so a working folder's files are neither listed, read nor hashed. Without `leaveOut` the call to the shell shall be as before. When `list(dir)` names a left-out folder, it shall give `[]` without calling the shell. Its version with `leaveOut` shall be the version of the files it lists, worked out as the memory store does.

## Examples

- Given a desktop store,
  when `list()` is called with `leaveOut: { folders: ["repo"], names: ["node_modules"] }`,
  then the shell's `fs_list` is called with that `leaveOut`, and a call without it sends none.
- Given a desktop store,
  when `list("repo")` is called with `leaveOut: { folders: ["REPO"] }`,
  then it gives `[]` and the shell isn't called.
- Given a workspace holding `workspace.yaml`, `repo/a.ts` and `node_modules/x.js`,
  when its version is asked for with `leaveOut: { folders: ["repo"], names: ["node_modules"] }`,
  then it equals the version of a workspace holding only `workspace.yaml`.
