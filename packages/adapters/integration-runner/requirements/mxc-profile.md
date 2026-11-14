# integration-runner.mxc-profile

- Status: planned
- Since: 0.2.0
- Source: HAL-3403 (design HAL-958, section 4.3; ADR 2026-11-10-mxc-sandbox-backend)

When the runner starts in `sandbox-mxc`, Halonic shall give it a profile of read grants for Node's folder, the runner and the integration's folder, one folder to read and write that is both the working folder and the temp folder, an environment holding only `TMPDIR`, and no network: no egress rule and no bridge, so the box has no loopback and no DNS either. The profile shall have no denied and no reopened paths, because MXC reads only what a grant names and takes no reopened paths. Halonic shall refuse the start, before a session is opened, when a path the runner needs is or holds the home folder or a socket folder.

## Examples

- Given the MXC backend and a runner start,
  when the profile is built,
  then `network` is `{ bridge: null, allowedSites: [] }` and `deniedPaths` and `reopenedPaths` are empty.
- Given an integration folder inside the home folder, on MXC,
  when the profile is built,
  then only that folder is granted to read, and the home folder is not listed.
- Given an integration folder that is the home folder, on MXC,
  when Halonic starts the runner,
  then no session is opened.
