# app.doctor-workspace

- Status: active
- Since: 0.1.0
- Source: HAL-2270; cli-output 3.7 (the Workspace line) and microcopy L90

While it runs inside a workspace, `halonic doctor` shall show a Workspace line with the workspace's name and whether this computer trusts it. While the workspace is trusted, the line shall be marked as ok. While it isn't trusted yet, has changed since it was trusted, can't be trusted because a file names something the trust check refuses, or its trust record can't be read, the line shall be marked as a warning. The line shall never be marked as failed. While a run in the workspace can only reach the test model, so it needs no trust, as for `halonic run`, the line shall be marked as ok and say no trust is needed, and the trust check shall not be read (HAL-6007).

## Examples

- Given the workspace `acme` is trusted on this computer,
  then the line is ✓ and names `acme`.
- Given `acme` has a new connector since it was trusted,
  then the line is ! and says it changed.
- Given `acme` uses only the test model, with no connector and no harness agent, and was never trusted,
  then the line is ✓ and says no trust is needed.
- Given the trust record can't be read,
  then the line is !, as for a workspace that isn't trusted yet.
