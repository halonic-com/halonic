# app.plugin-add

- Status: active
- Since: 0.1.0
- Source: HAL-1736 (plugins P3) plan, steps 1 to 4 and PR 3; P2 decision D5 on HAL-1735 (a plugin's folder is named exactly its id); the plugins ADR (`docs/adr/2026-11-09-plugins.md`), section 6 (plugins are copied into the profile's plugins folder, never into a workspace)

The app's `PluginService` shall add a plugin from a source folder, given through the `FolderReader` port, which may have any name. It shall read the source once and check it as `app.plugin-folder` asks, except for the folder's name, and keep the bytes of every file it read. It shall refuse, as broken with its problems and before anything is written, a source that can't be read or checked, and one whose id or file names `checkPluginFiles` refuses, such as `aux.js`, `notes.`, two names that are the same file on a disk that ignores case, or a path that escapes the folder. It shall then place exactly the bytes it checked through the `PluginFolderWriter` port, as the folder named by the plugin's id. When a plugin with the id in any case is already there, it shall refuse it as taken and change nothing, unless the caller replaces it and it has exactly the same id. After placing, it shall save an install record in the profile's records with the source (a folder path, or a git address and commit), the time, every file's SHA-256 and the plugin's secret names, and when it replaced a plugin, also every secret name the replaced one's install record kept or its folder declared, so removing the plugin later deletes them; and give the plugin as `load` gives it now. It shall not trust the plugin. When placing fails, it shall save no install record.

## Examples

- Given the weather plugin in a source folder named `Weather-Plugin`,
  when it is added,
  then the plugins folder holds `weather` with the same bytes, the plugin is new, and its install record gives the source, the time, the file hashes and the secret names.
- Given an added plugin a person trusts with the fingerprint `add` gave,
  when the plugins are loaded,
  then it is trusted.
- Given a source whose `plugin.yaml` changes after it was read,
  when it is added,
  then the `plugin.yaml` placed is the one that was read.
- Given a source with a link in it, a file `../outside.js`, `aux.js`, `notes.` or both `backend/index.js` and `Backend/index.js`, more than 2,000 files, or an id of 49 characters,
  when it is added,
  then it is refused as broken and the plugins folder is unchanged.
- Given the plugins folder holds `Weather`,
  when the weather plugin is added, with or without replacing,
  then it is refused as taken and nothing changes.
- Given the weather plugin was added and trusted,
  when a version with changed code is added with replace,
  then the old files are gone, the install record gives the new source, and the plugin has changed and gives no tools.
- Given placing fails,
  when a plugin is added,
  then the error is thrown and there is no install record.
- Given the weather plugin was added with the secrets `example-key` and `acme-key`,
  when a version without `acme-key` is added with replace,
  then its install record still names both secrets.
