# cli.commands.doctor.profile-line

- Status: active
- Since: unreleased
- Source: HAL-15201, the line Liam approved on the task and the doctor's Profile line in its plan; the reasons and fixes of `cli.profile-outside-workspace`; HAL-15827 (a folder inside the profile without `workspace.yaml`, from flow check C638)

When the folder `halonic doctor` checks and this computer's profile folder overlap by `profile.profile-outside-workspace`, the command shall not stop as other commands do: it shall print a Profile line ✕ first, before every other line, with the same reason as `cli.profile-outside-workspace` and its fix under it starting with "Fix:", leave the workspace's own lines out, and exit with 1. When a variable put the profile in the workspace, the reason shall name that variable and the fix shall name `HALONIC_HOME`; when the workspace is inside the profile, the reason shall name the profile's path, `~` for the home folder. With `--json`, the check shall be `profile` with its `problem`. Without an overlap, or when the folder has no `workspace.yaml`, there shall be no Profile line: a folder that isn't a workspace can't hold the profile as one, so `halonic doctor` there checks only the computer, and with `--dir` it still says there's no workspace (exit 4).

## Examples

- Given `HALONIC_HOME` is `<home>/acme/.profile`,
  when `halonic doctor --dir acme` runs in `<home>`,
  then it prints "✕ Profile     the profile folder HALONIC_HOME is inside this workspace." first, with "Fix: move it out of the workspace and set HALONIC_HOME to its new place, so a change in the workspace can't change your trust records." under it, has no Workspace line, and exits with 1.
- Given `HALONIC_HOME` is the profile folder and the workspace is `acme` inside it,
  when `halonic doctor` runs in `acme`,
  then the Profile line says "this workspace is inside the profile folder <profile>.", with "Fix: move the workspace somewhere else." under it, and it exits with 1.
- Given `HALONIC_HOME` is `<home>/acme-profile`,
  when `halonic doctor --dir acme` runs in `<home>`,
  then there is no Profile line.
- Given `HALONIC_HOME` is `~/.halonic` and the home folder has no `workspace.yaml`,
  when `halonic doctor` runs in the home folder,
  then there is no Profile line and it exits with 0.
- Given `HALONIC_HOME` is the profile folder and `empty` is a folder inside it without `workspace.yaml`,
  when `halonic doctor --dir <profile>/empty` runs,
  then there is no Profile line, it says there's no `workspace.yaml` there, and it exits with 4.
