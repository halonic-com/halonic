# studio.installer-wsl-image

- Status: active
- Since: unreleased
- Source: HAL-16773 (board, option A on HAL-16772), HAL-16765 (scope, PR 3); next to `studio.installer-wsl-runtime`

When `windows/build-installer.ps1` is given `-Image` with a folder that holds Halonic's WSL image as `infra/wsl-image/build.sh` writes it, the script shall stop when `halonic-wsl.tar.gz` or `sizes.json` is missing or the SHA-256 in `sizes.json` isn't the image's, and otherwise copy the image into the folder the installer config takes it from and add `tauri.image.conf.json`, so that the installer installs it next to the app as `halonic-wsl.tar.gz`, the name the shell's WSL setup reads. Without `-Image`, the installer shall ship no image.

## Examples

- Given `tauri.image.conf.json`,
  when it lists the files the installer copies,
  then `binaries/halonic-wsl.tar.gz` is installed as `halonic-wsl.tar.gz`, the file `infra/wsl-image/build.sh` writes, and nothing else is.
- Given the Windows installer config without `tauri.image.conf.json`,
  when it lists the files the installer copies,
  then the image isn't among them.
- Given `windows/build-installer.ps1`,
  when it is given `-Image`,
  then it checks the SHA-256 in `sizes.json` against the image's before it copies the image into `src-tauri/binaries/` and adds `tauri.image.conf.json`.
