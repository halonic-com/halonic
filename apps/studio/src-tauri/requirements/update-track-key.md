# studio.src-tauri.update-track-key

- Status: draft
- Since: unreleased
- Source: HAL-18480; HAL-18477 (Preview builds signed with their own key, `updater-keys.json`); the board's decision on HAL-18474

Where Halonic runs as the desktop app on the Preview update track, the shell shall check the signature of an update with the Preview public key in `apps/studio/src-tauri/updater-keys.json` (`preview.pubkey`), when it checks, downloads and installs it alike; on the Stable track it shall check with the `pubkey` in `tauri.conf.json`. If the Preview key can't be read, then the check shall fail as unreadable and shall never fall back to the release key.

## Examples

- Given an install on the Preview track and a preview build signed with the Preview key,
  when the shell downloads and installs it,
  then the signature matches and the update installs.
- Given an install on the Preview track and a build signed with the release key,
  when the shell downloads it,
  then the signature doesn't match and nothing is installed.
- Given an install on the Stable track,
  when the shell checks for an update,
  then it checks signatures with the key in `tauri.conf.json`.
