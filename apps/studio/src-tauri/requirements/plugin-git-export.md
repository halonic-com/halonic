# studio.src-tauri.plugin-git-export

- Status: draft
- Since: unreleased
- Source: HAL-11571; `app.plugin-add`; `studio.src-tauri.crates.git-guard.git-export`; `studio.src-tauri.plugin-source`

When the page calls `plugin_git_export` with a git address, an optional branch, tag or commit id, and a token of its own, the shell shall export that one commit, files only, into a new folder in the app's own data folder, never an opened folder, with the rules of `git-export`, and shall answer the place to add the plugin from, the full commit id and the remote's default branch. The page shall read that place with `plugin_source_entries` and `plugin_source_read`, and nothing else shall be read from it. The shell shall run nothing from the repository and leave no `.git`. When the page calls `plugin_git_export_end` with the token, then the shell shall stop an export that is still running, which stops git with every program it started, or remove the folder of one that has finished and forget its place, so no folder of the export is left; the call answers nothing and refuses nothing. If the token isn't one to 64 letters, digits, `-` or `_`, or is in use, or four exports are open, then the shell shall refuse the export before it starts. The first export after the app starts shall remove the `export-*` folders a crash left that are older than an export may run, and shall do so once per process. Only the local main window shall be granted the commands, in a capability of their own.

## Examples

- Given the person closes the Add plugin dialog while the export runs,
  when the page calls `plugin_git_export_end` with its token,
  then git is stopped, the export answers `cancelled`, and no folder is left.
- Given an export that finished and the dialog closes,
  when the page calls `plugin_git_export_end`,
  then its folder is removed and its place is no longer readable.
- Given a token that is already in use,
  when the page starts another export with it,
  then the shell refuses it as `export_token_invalid` and starts nothing.
- Given folders in the exports folder and no export open,
  when the first export starts,
  then those folders are removed first.
