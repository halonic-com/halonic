# parity.compose-case-workspace

- Status: active
- Since: 0.1.0
- Source: HAL-108

When the recorder builds the workspace for a case, the parity package shall copy the base workspace, put the case's own files on top of it (a file at the same path replaces the base file), and then delete the files the case removes.

If a case removes a file the workspace doesn't have, then the parity package shall refuse to build it and name the case.

## Examples

- Given a base with `workspace.yaml` and `models.yaml`, and a case with its own `models.yaml`,
  when the workspace is built,
  then it holds the base `workspace.yaml` and the case's `models.yaml`.
- Given a case that removes `workspace.yaml`,
  when the workspace is built,
  then it has no `workspace.yaml`.
- Given a case that removes `nothing.yaml`, which the base doesn't have,
  when the workspace is built,
  then building fails with a message that names the case and `nothing.yaml`.
