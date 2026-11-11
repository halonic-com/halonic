# studio.installer-third-party-notices

- Status: active
- Since: 0.1.0
- Source: HAL-6225 (part 2 of HAL-6177; MPL-2.0 section 3.2(a), HAL-6165)

When `windows/build-installer.ps1` builds the Windows installer, the script shall first write `THIRD-PARTY-NOTICES.txt` with `pnpm check:sbom --notices` into the folder the installer config takes it from, and the installer shall install it next to the app.

## Examples

- Given the Windows installer config,
  when it lists the files the installer copies,
  then a file from `src-tauri/legal/` is installed as `THIRD-PARTY-NOTICES.txt`.
- Given `windows/build-installer.ps1`,
  when it builds the installer,
  then it runs `pnpm check:sbom` with `--notices` into `src-tauri/legal/` before `tauri build`, and that folder is ignored by git.
