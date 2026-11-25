# studio.preview-publish

- Status: active
- Since: unreleased
- Source: HAL-18477

When the Studio preview workflow runs on `main` and its installer job passes (the installer builds, updates an install of the release version and Halonic keeps running), it shall publish the preview's Windows installer as a pre-release of `halonic-com/halonic-preview`, titled "Halonic <version> (Preview, not for general use)" and tagged `v<version>`, with `latest.json`, the installer's updater signature (`.sig`) and `SHA256SUMS`. The signature shall be made with the Preview updater key and checked against the Preview public key in `apps/studio/src-tauri/updater-keys.json`, which is not the release key in `tauri.conf.json`. When the installer job fails, or the run is on another branch, the workflow shall publish nothing. Until the click test (HAL-18353) is reliable and quick, publishing doesn't wait for it (board, HAL-18477).

## Examples

- Given a run of the preview workflow on `main` whose installer job built, updated and started 0.1.1-preview.42,
  when the publish job runs,
  then `halonic-com/halonic-preview` has the pre-release `v0.1.1-preview.42` with the installer, its `.sig`, `latest.json` and `SHA256SUMS`, and `latest.json` names the installer on that release.
- Given a run on another branch, or one whose installer job failed,
  when the run ends,
  then no release is created anywhere.
- Given the Preview public key in `updater-keys.json`,
  when it is read,
  then it is a minisign public key with the key id the file names, and not the key id of the release key.
