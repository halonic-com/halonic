# app.doctor-profile

- Status: active
- Since: unreleased
- Source: HAL-15201, the line Liam approved on the task and the doctor's Profile line in its plan; the profile's path for a moved profile, C646 (HAL-15892)

When the host finds that the workspace and this computer's profile folder overlap, `halonic doctor` shall show a Profile line with how they overlap, marked as failed and counted with the problems: a profile a variable put in the workspace, with that variable, or a workspace inside the profile, each with the profile's path as the person reads it. Without an overlap, or where the host checks nothing, there shall be no Profile line.

## Examples

- Given `XDG_DATA_HOME` put the profile in the workspace,
  then the report has a Profile line ✕ with `profile-in-workspace`, `XDG_DATA_HOME` and the profile's path, and the summary counts one problem.
- Given the workspace is inside `~/.local/share/halonic`,
  then the Profile line is ✕ with `workspace-in-profile` and that path.
- Given the host finds no overlap,
  then there is no Profile line.
