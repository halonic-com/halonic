# app.doctor-workspace-drive

- Status: active
- Since: 0.1.0
- Source: HAL-6517, decided by Liam on HAL-6513 from the WSL2 first-run research (HAL-6504, microsoft/WSL #4197)

While the host finds that the workspace `halonic doctor` runs in is on a Windows drive under WSL, such as `/mnt/c`, the Workspace line shall name that drive and be marked as a warning, whatever the workspace's trust: runs there are slow, and edits made from Windows aren't seen. The line shall never be marked as failed for it, because the workspace still runs there.

## Examples

- Given the trusted workspace `acme` is on `/mnt/c`,
  then the Workspace line is ! and names `/mnt/c`, and the summary counts one warning.
- Given `acme` needs no trust and is on `/mnt/d`,
  then the Workspace line is !.
