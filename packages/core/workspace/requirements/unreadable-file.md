# workspace.unreadable-file

- Status: active
- Since: 0.1.0
- Source: HAL-4511, found while building `halonic run --input` on HAL-4065

If the `DefinitionSource` refuses to read one of the workspace's files because the account may not read it (`EACCES`, or `EPERM` on Windows), then `loadWorkspace` shall throw an `invalid_input` error whose message names the file by its workspace path and whose fix says to check the file's permissions or move it out of the workspace. This holds as well when the source's `version()` fails that way, as a folder store's does because it reads every file: then the loader reads each listed file to find the one to name, and passes on the version's error when every file reads on its own. Any other error from the source shall reach the caller as it is.

## Examples

- Given a source that refuses `hubs/support/agents/sorter.agent.yaml` with `EACCES`, when the workspace is loaded, then it throws an `invalid_input` error "the workspace file hubs/support/agents/sorter.agent.yaml can't be read." with the fix "Check the file's permissions, or move it out of the workspace.", and the source's error as its cause.
- Given a source that refuses a file with `EPERM`, when the workspace is loaded, then it throws the same `invalid_input` error.
- Given a source that refuses `notes/README.md`, a file no kind places, and whose version reads every file, when the workspace is loaded, then the error names `notes/README.md`.
- Given a source whose version fails with `EACCES` while every file reads on its own, when the workspace is loaded, then the version's error is thrown unchanged.
- Given a source whose read fails with an error without such a code, when the workspace is loaded, then that error is thrown unchanged.
- Given a workspace folder with an agent file set to mode 000, when `halonic validate` runs, then it exits with 2 and says "✕ Couldn't check acme: the workspace file … can't be read." with the fix on the next line.
