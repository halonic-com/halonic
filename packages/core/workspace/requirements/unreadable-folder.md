# workspace.unreadable-folder

- Status: active
- Since: 0.1.0
- Source: HAL-4561, a follow-up to HAL-4511 (`workspace.unreadable-file`)

If the `DefinitionSource`'s `list()` or `version()` fails with an `UnreadableWorkspaceFolderError` because the account may not read one of the workspace's folders, then `loadWorkspace` shall throw an `invalid_input` error whose message names the folder by the error's workspace path and whose fix says to check the folder's permissions or move it out of the workspace, with the source's error as its cause. The loader shall not leave the folder out, because that would hide the agents in it without a word. Any other error from the listing shall reach the caller as it is.

## Examples

- Given a source whose `list()` fails with an `UnreadableWorkspaceFolderError` for `hubs/support/agents`, when the workspace is loaded, then it throws an `invalid_input` error "the workspace folder hubs/support/agents can't be read." with the fix "Check the folder's permissions, or move it out of the workspace.", and the source's error as its cause.
- Given a source whose `version()` fails with that error, when the workspace is loaded, then it throws the same `invalid_input` error.
- Given a source whose `version()` fails with `EACCES` and whose `list()` fails with an `UnreadableWorkspaceFolderError` for `notes`, when the workspace is loaded, then the error names `notes`.
- Given a source whose `list()` fails with an error that is not an `UnreadableWorkspaceFolderError`, when the workspace is loaded, then that error is thrown unchanged.
- Given a workspace folder with its `hubs/support/agents` folder set to mode 000, when `halonic validate` runs, then it exits with 2 and says "✕ Couldn't check acme: the workspace folder hubs/support/agents can't be read." with the fix on the next line.
