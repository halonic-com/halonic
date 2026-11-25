# studio.src-tauri.update-track

- Status: draft
- Since: unreleased
- Source: HAL-18480; the board's decision on HAL-18474 (Stable and Preview tracks, served from updates.halonic.com)

Where Halonic runs as the desktop app and no other tool updates it, the shell shall ask for updates only at the endpoint in `tauri.conf.json`, `https://updates.halonic.com/{{track}}/{{target}}-{{arch}}/{{current_version}}`, with `{{track}}` replaced by the install's update track: `stable` unless the updater's record (`<profile>/updates/updater.json`) says `"track": "preview"`, then `preview`. The shell shall keep the track in that record and send it to the page as `track` in the updater's status. A missing, unknown or broken `track` in the record shall count as `stable` and shall leave the rest of the record readable. An endpoint without `{{track}}` (a test build's own server) shall be asked as it is. The notes link of a preview version (`<version>-preview.<n>`) shall point to its release in `halonic-com/halonic-preview`, and every other version's to `halonic-com/halonic`.

## Examples

- Given an install whose record names no track,
  when the shell checks for an update,
  then it asks `https://updates.halonic.com/stable/windows-x86_64/<the version that runs>`.
- Given an install whose record says `"track": "preview"`,
  when the shell checks for an update,
  then it asks `https://updates.halonic.com/preview/windows-x86_64/<the version that runs>`.
- Given a record that says `"track": "nightly"` and `"automatic": false`,
  when the shell reads it,
  then the track is `stable` and automatic updates stay off.
- Given a test build whose `tauri.conf.json` names `http://127.0.0.1:8765/latest.json`,
  when the shell checks for an update,
  then it asks that address unchanged.
- Given the version `0.1.1-preview.42`,
  when the page shows its notes link,
  then it is `https://github.com/halonic-com/halonic-preview/releases/tag/v0.1.1-preview.42`.
