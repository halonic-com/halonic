# app.doctor-workspace-drive

- Status: active
- Since: unreleased
- Source: HAL-6517, decided by Liam on HAL-6513 from the WSL2 first-run research (HAL-6504, microsoft/WSL #4197); the edits reason dropped on HAL-12873

While the host finds that the workspace `halonic doctor` runs in is on a Windows drive under WSL, such as `/mnt/c`, the Workspace line shall name that drive and be marked as a warning, whatever the workspace's trust: runs there are slower. Edits made from Windows are still seen, because nothing in the CLI watches the workspace's files: each command reads them, and `routines watch` reads them again every tick (microsoft/WSL #4739 doesn't apply). The line shall never be marked as failed for it, because the workspace still runs there.

## Examples

- Given the trusted workspace `acme` is on `/mnt/c`,
  then the Workspace line is ! and names `/mnt/c`, and the summary counts one warning.
- Given `acme` needs no trust and is on `/mnt/d`,
  then the Workspace line is !.
