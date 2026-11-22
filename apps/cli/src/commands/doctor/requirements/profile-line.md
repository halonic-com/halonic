# cli.commands.doctor.profile-line

- Status: active
- Since: unreleased
- Source: HAL-15201, the line Liam approved on the task and the doctor's Profile line in its plan; the reasons and fixes of `cli.profile-outside-workspace`

When the folder `halonic doctor` checks and this computer's profile folder overlap by `profile.profile-outside-workspace`, the command shall not stop as other commands do: it shall print a Profile line ✕ first, before every other line, with the same reason as `cli.profile-outside-workspace` and its fix under it starting with "Fix:", leave the workspace's own lines out, and exit with 1. When a variable put the profile in the workspace, the reason shall name that variable and the fix shall name `HALONIC_HOME`; when the workspace is inside the profile, the reason shall name the profile's path, `~` for the home folder. With `--json`, the check shall be `profile` with its `problem`. Without an overlap, there shall be no Profile line.

## Examples

- Given `HALONIC_HOME` is `./acme/.profile`,
  when `halonic doctor --dir acme` runs,
  then it prints "✕ Profile     the profile folder HALONIC_HOME is inside this workspace." first, with "Fix: move it out of the workspace and set HALONIC_HOME to its new place, so a change in the workspace can't change your trust records." under it, has no Workspace line, and exits with 1.
- Given `HALONIC_HOME` is the profile folder and the workspace is `acme` inside it,
  when `halonic doctor` runs in `acme`,
  then the Profile line says "this workspace is inside the profile folder <profile>.", with "Fix: move the workspace somewhere else." under it, and it exits with 1.
- Given `HALONIC_HOME` is `./acme-profile`,
  when `halonic doctor --dir acme` runs,
  then there is no Profile line.
