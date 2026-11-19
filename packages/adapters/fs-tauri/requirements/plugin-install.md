# fs-tauri.plugin-install

- Status: draft
- Since: unreleased
- Source: HAL-11571; HAL-12448; `ports.plugin-folder-writer`, `ports.folder-reader`; `studio.src-tauri.plugin-source`, `studio.src-tauri.plugin-folder-place`, `studio.src-tauri.plugin-git-export`

The Tauri plugin install source shall give the Add plugin dialog a place to add a plugin from: the folder the person picks with the shell's folder picker, or one commit of a git repository the shell exports for an address and an optional reference. The Tauri plugin source reader shall implement `FolderReader` over the shell's `plugin_source_entries` and `plugin_source_read` for a location that a pick or an export answered, naming that location and no path, and shall refuse an unsafe path with a `RangeError` before it calls the shell. It shall give that location as the folder's own location, and the location followed by the path for an entry that is there, so core can read a source as it reads any folder. The Tauri plugin folder writer's `place` shall refuse an unsafe plugin id or file path with a `RangeError` before it calls the shell, and then place the files through `plugin_folder_place` with each file's bytes as base64url, and answer `placed` or `taken`. When the signal of an export aborts, the install source shall end the export, so the shell stops git and removes its folder, and reject with a `conflict` error; and when the export ends after the abort, it shall end it again. The shell's own sentence for a location that wasn't picked, an address or reference it refuses, or a plugin or repository that is too large shall reach the person as the error's message; a rejection that isn't the shell's refusal shape, such as a page without the capability, shall reject with an `unavailable` error that doesn't repeat the shell's text.

## Examples

- Given a picked folder holding `plugin.yaml`,
  when the reader lists it and reads `plugin.yaml`,
  then every call names the picked location and no path, and the bytes are the file's.
- Given a picked folder holding `src/index.js`,
  when the reader is asked for the folder's location and that file's,
  then it gives the picked location and the picked location followed by `/src/index.js`, and `null` for a file that isn't there.
- Given a location the person never picked,
  when the reader lists it,
  then it rejects with a `denied` error that says to use Choose folder, which the installer can tell from other refusals.
- Given the writer and a plugin name in use in another case,
  when it places the plugin,
  then it answers `taken`.
- Given the writer and the id `..`, or a file path `../outside`,
  when it places a plugin,
  then it rejects with a `RangeError` and the shell is not called.
- Given an export that is still running,
  when the dialog's signal aborts,
  then the export is ended and the call rejects with `conflict`.
- Given a git address the shell refuses,
  when the install source exports it,
  then it rejects with `invalid_input` and the shell's sentence.
- Given a page without the capability,
  when it picks a folder or exports,
  then it rejects with `unavailable` and none of the shell's text.
