# profile.profile-outside-workspace

- Status: draft
- Since: unreleased
- Source: HAL-15201, the line Liam approved on the task (refuse every profile inside the workspace except the built-in default); Julian's finding I1 on HAL-15195

The profile package shall decide whether a workspace may be opened with a profile folder, from the real paths of the workspace, the profile and the built-in profile. The built-in profile shall be the profile folder found with no variables set: the home folder and the platform's own data folder. When the profile is the workspace or inside it, and isn't the built-in profile, and a variable put it there, the workspace shall be refused as `profile-in-workspace`, naming that variable: `HALONIC_HOME` when it is set, else `LOCALAPPDATA` on Windows or `XDG_DATA_HOME` on Linux. When the workspace is the profile or inside it, whichever profile it is, the workspace shall be refused as `workspace-in-profile`. Names shall be compared as a file system that folds case might open them, with either separator on Windows and without trailing separators. The cases in `golden/profile-places.json` are shared with the desktop shell.

## Examples

- Given `HALONIC_HOME` is `/srv/ann/acme/.profile`,
  when the workspace `/srv/ann/acme` is opened,
  then it is refused as `profile-in-workspace`, naming `HALONIC_HOME`.
- Given `XDG_DATA_HOME` is `/srv/ann/acme/.data` on Linux,
  when the workspace `/srv/ann/acme` is opened,
  then it is refused as `profile-in-workspace`, naming `XDG_DATA_HOME`.
- Given no variables and the home folder `/srv/ann` as the workspace,
  when it is opened,
  then it is not refused: the profile there is the built-in one.
- Given the profile `/srv/ann/acme-profile`,
  when the workspace `/srv/ann/acme` is opened,
  then it is not refused.
- Given the workspace `/srv/ann/.local/share/halonic/work` and the built-in profile,
  when it is opened,
  then it is refused as `workspace-in-profile`.
