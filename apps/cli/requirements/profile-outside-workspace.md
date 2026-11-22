# cli.profile-outside-workspace

- Status: draft
- Since: unreleased
- Source: HAL-15201, the line Liam approved on the task; Julian's finding I1 on HAL-15195; wording from the approved plan, built on cli-output section 3 ("Which folder"); "your profile folder", C637 rows 57 and 58 (HAL-15839)

When a command opens a workspace, or `halonic init` or `halonic extract` makes the folder for one, the CLI shall first check the workspace against this computer's profile folder by `profile.profile-outside-workspace`, from the real paths as far as they exist, before it reads or writes anything in the workspace. When a variable put the profile in the workspace, it shall stop with `invalid_input` (exit 2), code `profile-in-workspace`, the reason "your profile folder, set by <variable>, is inside this workspace." and the fix "Move it out of the workspace and set HALONIC_HOME to its new place, so a change in the workspace can't change your trust records.", where `<variable>` is the one that put it there; the fix always names `HALONIC_HOME`, because `XDG_DATA_HOME` and `LOCALAPPDATA` point at a parent folder that other apps share. When the workspace is inside the profile, it shall stop with `invalid_input` (exit 2), code `workspace-in-profile`, the reason "this workspace is inside your profile folder <profile>." with the profile's path, `~` for the home folder, and the fix "Move the workspace somewhere else." The built-in profile in a home folder workspace shall not stop it. A relative `HALONIC_HOME` or home folder finds no profile, so nothing is checked; the commands that use the profile refuse it themselves. A folder without `workspace.yaml` is no workspace, so a command that opens one shall say there's no workspace there (exit 4) without the check. `halonic doctor` shall report the overlap on its Profile line instead of stopping (`cli.commands.doctor.profile-line`). `halonic trust --remove` shall not check, because it doesn't open the workspace: it only takes trust away, also for a folder that is gone.

## Examples

- Given `HALONIC_HOME` is `./acme/.profile`,
  when the person runs `halonic validate --dir acme`,
  then it stops with "your profile folder, set by HALONIC_HOME, is inside this workspace." and exits 2.
- Given `HALONIC_HOME` is the workspace folder itself,
  when the person runs `halonic validate --json`,
  then the error's code is `profile-in-workspace`.
- Given `XDG_DATA_HOME` is `./acme/.data` on Linux,
  when the person runs `halonic validate --dir acme`,
  then the reason names `XDG_DATA_HOME` and the fix says to set `HALONIC_HOME` to its new place.
- Given `HALONIC_HOME` is `./new/.profile`,
  when the person runs `halonic extract support new`,
  then it stops with code `profile-in-workspace` and writes nothing in `new`.
- Given `HALONIC_HOME` is `./acme-profile`,
  when the person runs `halonic validate --dir acme`,
  then it isn't stopped.
- Given no variables and the home folder as the workspace,
  when the person runs `halonic validate` there,
  then it isn't stopped.
- Given the workspace is inside the profile folder,
  when the person runs `halonic validate` there,
  then it stops with "this workspace is inside your profile folder ~/profile." and exits 2.
