# fs-node.unreadable-workspace-folder

- Status: active
- Since: 0.1.0
- Source: HAL-4561, a follow-up to HAL-4511

If the account may not read a folder under the folder definition store's root (`EACCES`, or `EPERM` on Windows), then `list()`, and `version()` that lists the files, shall throw an `UnreadableWorkspaceFolderError` whose `path` is that folder's workspace path and whose `cause` is the file system's error, instead of leaving the folder out. A root the account may not read has no workspace path, so its error shall reach the caller as it is.

## Examples

- Given a root holding `hubs/support/agents/sorter.agent.yaml` with `hubs/support` set to mode 000,
  when `list()`, `list("hubs")` or `version()` is called,
  then it throws an `UnreadableWorkspaceFolderError` with the path `hubs/support` and a cause with the code `EACCES`.
- Given a root set to mode 000,
  when `list()` is called,
  then it throws the file system's `EACCES` error.
