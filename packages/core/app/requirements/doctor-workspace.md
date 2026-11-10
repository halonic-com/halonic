# app.doctor-workspace

- Status: active
- Since: 0.1.0
- Source: HAL-2270; cli-output 3.7 (the Workspace line) and microcopy L90

While it runs inside a workspace, `halonic doctor` shall show a Workspace line with the workspace's name and whether this computer trusts it. While the workspace is trusted, the line shall be marked as ok. While it isn't trusted yet, has changed since it was trusted, or its trust record can't be read, the line shall be marked as a warning. The line shall never be marked as failed.

## Examples

- Given the workspace `acme` is trusted on this computer,
  then the line is ✓ and names `acme`.
- Given `acme` has a new connector since it was trusted,
  then the line is ! and says it changed.
- Given the trust record can't be read,
  then the line is !, as for a workspace that isn't trusted yet.
