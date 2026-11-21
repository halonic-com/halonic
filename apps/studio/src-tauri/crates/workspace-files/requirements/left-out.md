# studio.src-tauri.crates.workspace-files.left-out

- Status: draft
- Since: unreleased
- Source: HAL-13334 plan, PR 5; `ports.definition-store-left-out`, which it matches

When `fs_list` is given `leaveOut` (`{ folders?, names? }`), the shell's workspace files shall leave out every file in or under one of the folders, and every file with a segment that is one of the names, comparing segments as `segmentAsOpened` in `@halonicjs/ports` gives them. The walk shall never step into a left-out folder, so nothing under it is read and a folder in it the account may not read fails nothing. A list of a left-out folder shall give no files. A folder that isn't a safe workspace path, a name with a `/`, or a segment that is empty once folded shall be refused as `unsafe_path`. Without `leaveOut` a list shall be as before, and a left-out file shall still read, write and remove. Links are never followed, so a link can't lead the walk into a left-out folder.

## Examples

- Given `workspace.yaml`, `repository.md`, `repo/src/a.ts` and `tools/Node_Modules/y.js`,
  when the workspace is listed with `leaveOut: { folders: ["REPO"], names: ["node_modules"] }`,
  then the list is `repository.md` and `workspace.yaml`.
- Given the folder `repo/locked` the account may not read,
  when the workspace is listed with `leaveOut: { folders: ["repo"] }`,
  then the list succeeds, and without the option it is refused as `folder_unreadable`.
- Given `leaveOut: { folders: ["a/../b"] }`,
  when the workspace is listed,
  then it is refused as `unsafe_path`.
