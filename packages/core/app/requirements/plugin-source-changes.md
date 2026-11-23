# app.plugin-source-changes

- Status: active
- Since: unreleased
- Source: HAL-16319 (C696 findings 3 and 4 on HAL-16316)

The app shall give the files added, changed and removed, by path, between two lists of a plugin's file hashes, such as the install records before and after `plugin add --update`. It shall also compare an added plugin's copy, the file hashes its install record holds, with the folder it was copied from as that folder is now, reading the folder as adding it reads a source: private names (`.git`, `.env*`) and paths the sandbox denies in a home folder (`.ssh`, `.aws`) shall be left out, so they never count as a change. A folder that can't be read or checked shall give its problems instead of changes.

## Examples

- Given an install record with `plugin.yaml` and `backend/index.js`,
  when the source folder's `backend/index.js` is edited and `backend/extra.js` added,
  then `backend/extra.js` is added and `backend/index.js` changed.
- Given the same record and a source folder that only gained `.env`,
  when they are compared,
  then nothing changed.
- Given a source folder whose `plugin.yaml` is no longer a plugin manifest,
  when it is compared,
  then it gives the manifest's problems.
