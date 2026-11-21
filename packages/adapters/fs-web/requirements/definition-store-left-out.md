# fs-web.definition-store-left-out

- Status: active
- Since: unreleased
- Source: HAL-13334 plan, PR 4

When `list()` or `version()` of the browser folder store is given `leaveOut`, the store shall not step into a left-out folder at all, so a working folder's files are neither listed, read nor hashed, and a folder inside one that the browser can't read doesn't fail the call. When `list(dir)` names a left-out folder, it shall give `[]`. Its version with `leaveOut` shall be the version of the files it lists, worked out as the memory store does. The browser API has no links, so the walk can't follow one into a left-out folder.

## Examples

- Given an opened folder holding `workspace.yaml` and `repo/locked/a.ts`, where reading `repo/locked` fails,
  when `list()` is called with `leaveOut: { folders: ["repo"] }`,
  then it gives `["workspace.yaml"]`, and without the option it rejects.
- Given an opened folder holding `repo/a.ts`,
  when `list("repo")` is called with `leaveOut: { folders: ["REPO"] }`,
  then it gives `[]`.
- Given an opened folder holding `workspace.yaml`, `repo/a.ts` and `node_modules/x.js`,
  when its version is asked for with `leaveOut: { folders: ["repo"], names: ["node_modules"] }`,
  then it equals the version of a folder holding only `workspace.yaml`.
