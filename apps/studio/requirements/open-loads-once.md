# studio.open-loads-once

- Status: draft
- Since: unreleased
- Source: HAL-19531 step 3 (HAL-19964), plan approved by Liam on 26 Nov; `studio.workspace-trust`, `studio.workspace-runs`

When the desktop app opens a folder, the runs (`studio.workspace-runs`) shall take the workspace the trust check (`studio.workspace-trust`) just loaded for their first read of the files, instead of loading the workspace a second time. When that check failed, the runs shall load the workspace themselves. After a file changed, the runs shall load the workspace again, as before.

## Examples

- Given a folder the trust check has just loaded,
  when the Runs list first reads the runs,
  then the workspace's files are not read again, and the runs name their workflow from that load.
- Given a folder whose trust check failed,
  when the Runs list first reads the runs,
  then the runs load the workspace themselves.
