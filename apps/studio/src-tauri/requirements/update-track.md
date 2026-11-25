# studio.src-tauri.update-track

- Status: draft
- Since: unreleased
- Source: HAL-18480, HAL-18814 (the chosen track and the build's default, Chief's decision on HAL-18474); the board's decision on HAL-18474 (Stable and Preview tracks, served from updates.halonic.com)

Where Halonic runs as the desktop app and no other tool updates it, the shell shall ask for updates only at the endpoint in `tauri.conf.json`, `https://updates.halonic.com/{{track}}/{{target}}-{{arch}}/{{current_version}}`, with `{{track}}` replaced by the install's update track and send that track to the page as `track` in the updater's status. The install's track shall be the person's choice, kept as `chosenTrack` in the updater's record (`<profile>/updates/updater.json`) and written only when the page saves one with `update_set_track`; with no choice saved, it shall be `preview` for a version `<version>-preview.<n>` and `stable` for every other version. A missing, unknown or broken `chosenTrack` shall count as no choice and shall leave the rest of the record readable; the record's older `track` key shall not count as a choice. When `update_set_track` changes the install's track, the shell shall stop a download in progress and drop an update that was found or downloaded but not installed. An endpoint without `{{track}}` (a test build's own server) shall be asked as it is. The notes link of a preview version (`<version>-preview.<n>`) shall point to its release in `halonic-com/halonic-preview`, and every other version's to `halonic-com/halonic`.

## Examples

- Given an install of `0.1.1` whose record names no chosen track,
  when the shell checks for an update,
  then it asks `https://updates.halonic.com/stable/windows-x86_64/0.1.1`.
- Given an install of `0.1.1-preview.3` whose record names no chosen track, or only `"track": "stable"`,
  when the shell checks for an update,
  then it asks `https://updates.halonic.com/preview/windows-x86_64/0.1.1-preview.3`.
- Given an install of `0.1.1-preview.3` whose record says `"chosenTrack": "stable"`,
  when the shell checks for an update,
  then it asks the `stable` path.
- Given a record that says `"chosenTrack": "nightly"` and `"automatic": false`,
  when the shell reads it,
  then there is no chosen track and automatic updates stay off.
- Given an install on Preview with Halonic `0.1.1-preview.4` downloaded and not installed,
  when the page saves the track `stable`,
  then the download is dropped and nothing installs when Halonic quits.
- Given a test build whose `tauri.conf.json` names `http://127.0.0.1:8765/latest.json`,
  when the shell checks for an update,
  then it asks that address unchanged.
- Given the version `0.1.1-preview.42`,
  when the page shows its notes link,
  then it is `https://github.com/halonic-com/halonic-preview/releases/tag/v0.1.1-preview.42`.
