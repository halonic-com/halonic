# studio.desktop-plugin-installer

- Status: draft
- Since: unreleased
- Source: HAL-11571; HAL-12448; `app.plugin-add`; `fs-tauri.plugin-install`; `studio.desktop-plugins-host`

The desktop app shall give the Add plugin dialog an installer that adds a plugin from a folder the person picked with Choose folder, or from one commit of a git repository, through core's `PluginService.add`, and shall add it not trusted. It shall read the source once through the shell's source reader, so core checks and hashes the bytes the shell then places, and it shall name no path of its own. It shall leave a private name out of what it reads and places, at any depth: `.git`, `.studio`, `.env` and `.env.*`, `.envrc`, so a plugin author's secrets never reach the plugins folder. It shall say `added` with the plugin's folder name, `taken` with the id in use and the plugin's name, `no-manifest` for a source without `plugin.yaml`, and `broken` with the problems for a plugin core refuses; it shall say `offline` with the host when git couldn't reach the repository, and it shall let any other failure through with the shell's sentence. After a plugin is added it shall read the plugins folder again, and a failed read shall not undo the add. For a git source it shall end the export when the add finishes, fails or is aborted, so no exported folder is left. When the person types a folder instead of picking it, the shell refuses it and the installer shall say `not-picked`, not `broken`.

## Examples

- Given a picked folder holding a valid plugin,
  when the dialog adds it,
  then the plugin is placed from the bytes core read, the plugins are read again, and the outcome is `added` with its folder name.
- Given a plugin called `acme-weather` in use,
  when the dialog adds another with the same id in any case,
  then the outcome is `taken` and nothing was written.
- Given a git repository with a valid plugin,
  when the dialog adds it,
  then the plugin's install record names the address and the full commit, and the export is ended.
- Given a repository whose host can't be reached,
  when the dialog adds it,
  then the outcome is `offline` with the host and nothing was installed.
- Given a folder that has no `plugin.yaml`,
  when the dialog adds it,
  then the outcome is `no-manifest`.
- Given a picked folder with a `.env`, a `.studio` folder and a nested `.git` folder beside the plugin's files,
  when the dialog adds it,
  then none of them is listed, read or placed, and the plugin is added without them.
- Given a path the person typed that was never picked,
  when the dialog adds it,
  then the outcome is `not-picked` and nothing was written.
- Given the shell's own source reader over a picked folder holding a valid plugin, and core's `PluginService`,
  when the dialog adds it,
  then the outcome is `added`, so the trust check can open.
- Given an add that is aborted while git runs,
  when the dialog closes,
  then the export is ended and no folder is left.
