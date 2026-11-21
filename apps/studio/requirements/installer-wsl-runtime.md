# studio.installer-wsl-runtime

- Status: active
- Since: unreleased
- Source: HAL-15136 (board, option A on HAL-15093), HAL-14644

When `windows/build-installer.ps1` is given `-Runtime` with a folder that holds the WSL runtime `infra/wsl-image/runtime-archive.sh` packed, the script shall stop when `halonic-runtime.tar.gz` or `halonic-runtime.json` is missing or the manifest's SHA-256 isn't the archive's, and otherwise copy both into the folder the installer config takes them from and add `tauri.runtime.conf.json`, so that the installer installs them next to the app under the names the shell reads its runtime from. Without `-Runtime`, the installer shall ship no runtime.

## Examples

- Given `tauri.runtime.conf.json`,
  when it lists the files the installer copies,
  then `binaries/halonic-runtime.tar.gz` and `binaries/halonic-runtime.json` are installed under the archive and manifest names `bundled_runtime.rs` reads.
- Given the Windows installer config without `tauri.runtime.conf.json`,
  when it lists the files the installer copies,
  then neither runtime file is among them.
- Given `windows/build-installer.ps1`,
  when it is given `-Runtime`,
  then it checks the manifest's SHA-256 against the archive's before it copies them into `src-tauri/binaries/` and adds `tauri.runtime.conf.json`, and that folder is ignored by git.
