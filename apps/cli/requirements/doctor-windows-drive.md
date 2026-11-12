# cli.doctor-windows-drive

- Status: active
- Since: 0.1.0
- Source: HAL-6517, decided by Liam on HAL-6513 from the WSL2 first-run research (HAL-6504, microsoft/WSL #4197); the words agreed by Elena and Sofia on HAL-6517; `More:` added on HAL-6552

While the CLI runs on Linux under WSL (`/proc/version` names Microsoft) and the workspace's real path is on a Windows drive (`/mnt/<letter>`), `halonic doctor` shall mark the Workspace line with ! and, under the workspace's trust, say which drive it is on and why that matters, then the fix: move it into the Linux home folder, then `More:` with the sandbox page's `#wsl2-folder` section. It shall still exit with 0 for it. Outside WSL, and for a workspace in Linux's own files, the Workspace line shall be as before. With `--json`, the Workspace check shall carry `windowsDrive`.

## Examples

- Given WSL and the trusted workspace Acme in a folder on `/mnt/c`,
  when `halonic doctor --dir acme` runs,
  then it prints "! Workspace   Acme · trusted on this computer", then "The workspace is on the Windows drive /mnt/c, so runs are slow and Halonic doesn't notice edits made in Windows." and "Fix: move it into your Linux home folder (~), then run halonic doctor again." and "More: https://docs.halonic.com/sandbox#wsl2-folder", counts one warning, and exits with 0.
- Given WSL and a workspace in `~/acme`,
  when `halonic doctor` runs,
  then the Workspace line says nothing about a drive.
- Given `/proc/version` without "microsoft",
  then the CLI doesn't look for a Windows drive.
