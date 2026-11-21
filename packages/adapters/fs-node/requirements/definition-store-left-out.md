# fs-node.definition-store-left-out

- Status: active
- Since: unreleased
- Source: HAL-13334 plan, PR 3

When `list()` or `version()` of the folder definition store is given `leaveOut`, the store shall not step into a left-out folder at all, so a working folder's files are neither listed, read nor hashed, and an unreadable folder inside one doesn't fail the call. When `list(dir)` names a left-out folder, it shall give `[]`. Its version with `leaveOut` shall equal the memory store's for the same files and `leaveOut`.

## Examples

- Given a root holding `workspace.yaml` and `repo/locked/a.ts`, with `repo/locked` set to mode 000,
  when `list()` is called with `leaveOut: { folders: ["repo"] }`,
  then it gives `["workspace.yaml"]`, and without the option it rejects with an `UnreadableWorkspaceFolderError`.
- Given a root holding `repo/a.ts`,
  when `list("repo")` is called with `leaveOut: { folders: ["REPO"] }`,
  then it gives `[]`.
- Given a root and a memory store holding the same `repo/a.ts`, `node_modules/x.js` and `workspace.yaml`,
  when both versions are asked for with `leaveOut: { folders: ["repo"], names: ["node_modules"] }`,
  then they are equal.
