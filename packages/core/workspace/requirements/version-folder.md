# workspace.version-folder

- Status: active
- Since: unreleased
- Source: HAL-16335, plan approved by Liam on the task: a trust check hashes local integrations from the version a run starts; leaving out private entries by the same rule as a run's copy is Liam's condition there

The workspace package shall give a `FolderReader` at a commit (`VersionFolder`) that lists and reads files only through `Vcs.listAt` and `Vcs.readAt` at that commit, never from the files on disk. It shall leave out every entry a workspace keeps private with `isPrivateWorkspacePath`, the rule a run's copy of the commit is checked out by, so it holds the files that copy holds. It shall list the folders above each file as folders, sorted by code unit, and give each file's committed text as UTF-8 bytes. It shall refuse unsafe paths with a `RangeError` before it asks the version control, and refuse a version that isn't a full commit id.

## Examples

- Given `integrations/notes/backend/index.js` committed with `export default 1;` and saved later with `export default 2;`, when the folder at that commit reads it, then it gets the committed bytes.
- Given `integrations/notes/.env` committed next to `integrations/notes/integration.yaml`, when the folder at that commit lists `integrations/notes`, then `.env` isn't listed and reading it gives `null`.
- Given files in `integrations/notes/` and `integrations/mail/backend/`, when the folder lists `integrations` without going into folders, then it gives the folders `integrations/mail` and `integrations/notes`.
- Given a read of `../secrets.txt` or the version `HEAD`, then it is refused with a `RangeError`.
