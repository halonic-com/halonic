# app.run-proposal-unreadable

- Status: active
- Since: unreleased
- Source: HAL-15274, from Nina's C554 check (HAL-15255) of #4251; the words of `workspace.unreadable-folder` and `workspace.unreadable-file`, decided by Tomas on the task

When a run with history off copies the saved files (`app.run-proposal-history-off`) and the workspace's `list()` fails with an `UnreadableWorkspaceFolderError`, the copy shall fail with the `invalid_input` error loading gives for that folder (`workspace.unreadable-folder`), naming it by its workspace path and saying to check the folder's permissions or move it out of the workspace, with the source's error as its cause. When reading one of the files fails because the account may not read it (`EACCES`, or `EPERM` on Windows), the copy shall fail with the error loading gives for that file (`workspace.unreadable-file`). This holds as well for a folder loading leaves out, such as a `node_modules` folder or a harness agent's working folder, since the copy holds those. In both cases no copy shall be left, and any other error shall reach the caller as it is.

## Examples

- Given history is off and the workspace's `list()` fails with an `UnreadableWorkspaceFolderError` for `node_modules/pkg/locked`,
  when a run starts,
  then it fails with "the workspace folder node_modules/pkg/locked can't be read." and the fix "Check the folder's permissions, or move it out of the workspace.", and no copy is left.
- Given history is off and reading `scratch/notes.md` fails with `EACCES`,
  when a run starts,
  then it fails with "the workspace file scratch/notes.md can't be read." and the fix "Check the file's permissions, or move it out of the workspace.", and no copy is left.
- Given history is off and the workspace's `list()` fails with any other error,
  when a run starts,
  then that error is thrown unchanged.
