# Decision: the desktop app adds a plugin from a folder, and a typed path asks for Choose folder

- Task: HAL-12448
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-12448 (a bug fix the team decides; Liam approves and signs this note in review). The new field line builds on the approved Add plugin dialog (HAL-2282: a small wording that builds on an approved screen is the team's).
- Kind: user-visible

## What changes

- `fs-tauri.plugin-install`: the source reader's `locationOf` gave `null` always, so core's `PluginService.add` read every source as "removed while Halonic read the plugin" and no plugin could be added in the desktop app. It now gives the location `pick` or `exportGit` answered, and that location followed by the path for an entry that is there. The assertion `expect(await reader.locationOf()).toBeNull()` in `plugin-install.test.ts` is removed and replaced by a test of the new answer. A sentence and an example are added; a refused location keeps its `denied` error and the shell's sentence.
- `studio.desktop-plugin-installer`: for a typed path the installer let the shell's sentence through. Core never let it through: it wrapped it in a plugin.yaml problem, so the dialog said "Its plugin.yaml has 1 problem". The installer now says `not-picked`. The sentence and its example change to say so, and the test "lets the shell's sentence through for a path the person typed instead of picking", which faked a service that throws, is replaced by tests that run the installer with the real `TauriPluginSourceReader` and core's `PluginService` over a fake shell: a picked folder is added, a typed path is `not-picked`, an id in use is `taken`. `taken` now also gives the plugin's name.
- `plugins.plugin-add`: a sentence and an example are added. `not-picked` shows "Halonic can't read a typed path. Choose the folder with Choose folder…" under the Folder field, which takes focus, and **Open *name*** uses the plugin's name when the app knows it ("Open Weather"), the id otherwise. The existing examples and tests stay.
- `app.plugin-add`: `taken` also gives the new plugin's name, and a reader's failure gives its reason without a second full stop. The two `taken` expectations in `plugin-add.test.ts` gain `name: "Weather"`; nothing else in them changes.

## Why

Found on HAL-12423 in a desktop build of `main`: adding any valid plugin from a folder failed, and a typed folder read as a broken plugin.yaml with a double full stop. The tests used fake readers that answered `locationOf`, so the real reader was never run through `PluginService.add`; the new installer test fails on the old reader.

## Covers

- fs-tauri.plugin-install
- packages/adapters/fs-tauri/src/plugin-install.test.ts
- studio.desktop-plugin-installer
- apps/studio/src/plugins/desktop-plugin-installer.test.ts
- plugins.plugin-add
- app.plugin-add
- packages/core/app/src/plugin-add.test.ts
