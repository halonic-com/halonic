# cli.commands.doctor.profile-line

- Status: active
- Since: unreleased
- Source: HAL-15201, the line Liam approved on the task and the doctor's Profile line in its plan; the reasons and fixes of `cli.profile-outside-workspace`; the capital and "your profile folder", C637 rows 57 and 58 (HAL-15839); the profile's path and Studio's fix, C646 (HAL-15892)

When the folder `halonic doctor` checks and this computer's profile folder overlap by `profile.profile-outside-workspace`, the command shall not stop as other commands do: it shall print a Profile line ✕ first, before every other line, with the same reason as `cli.profile-outside-workspace`, starting with a capital, and its fix under it starting with "Fix:", leave the workspace's own lines out, and exit with 1. When a variable put the profile in the workspace, the reason shall name the profile's path, `~` for the home folder, and the fix shall name `HALONIC_HOME`, led by the variable when another one put it there; when the workspace is inside the profile, the reason shall name the profile's path the same way. With `--json`, the check shall be `profile` with its `problem`. Without an overlap, or when the folder has no `workspace.yaml`, there shall be no Profile line: a folder that isn't a workspace can't hold the profile as one, so `halonic doctor` there checks only the computer, and with `--dir` it still says there's no workspace (exit 4).

## Examples

- Given `HALONIC_HOME` is `<home>/acme/.profile`,
  when `halonic doctor --dir acme` runs in `<home>`,
  then it prints "✕ Profile     Your profile folder ~/acme/.profile is inside this workspace." first, with "Fix: a change to this workspace could change what you trust. Move the profile folder out, set HALONIC_HOME to its new place." under it, has no Workspace line, and exits with 1.
- Given `HALONIC_HOME` is the profile folder and the workspace is `acme` inside it,
  when `halonic doctor` runs in `acme`,
  then the Profile line says "This workspace is inside your profile folder <profile>.", with "Fix: move the workspace somewhere else." under it, and it exits with 1.
- Given `HALONIC_HOME` is `<home>/acme-profile`,
  when `halonic doctor --dir acme` runs in `<home>`,
  then there is no Profile line.
- Given `HALONIC_HOME` is `~/.halonic` and the home folder has no `workspace.yaml`,
  when `halonic doctor` runs in the home folder,
  then there is no Profile line and it exits with 0.
