# studio.src-tauri.crates.trust-grant.profile-place

- Status: draft
- Since: unreleased
- Source: HAL-15201, the line Liam approved on the task (refuse every profile inside the workspace except the built-in default); Julian's finding I1 on HAL-15195; the refusal kinds decided with Sofia on HAL-15232

When the person picks a folder, the shell reopens a picked folder after a restart, a trust grant would open a folder, or New workspace makes or opens a folder, the shell shall first check the folder's real path against the CLI's profile folder by `profile.profile-outside-workspace`, before it opens the folder or remembers it. When a variable put the profile in the folder, it shall refuse as `profile_inside`, with that variable (`HALONIC_HOME`, `XDG_DATA_HOME` or `LOCALAPPDATA`) as the refusal's `reason`. When the folder is the profile or inside it, it shall refuse a pick, a reopen or a grant as `workspace_inside_profile`, and New workspace as `parent_private`. A refused folder shall not open, a refused pick shall not be remembered, a refused reopen shall keep its entry in the list, and a refused grant shall save no record and ask nothing. The built-in profile in a home folder workspace shall not be refused; the file fence keeps it out of reach there.

## Examples

- Given `HALONIC_HOME` is `acme/.profile`,
  when the person picks `acme`,
  then the pick is refused as `profile_inside` with the reason `HALONIC_HOME`, `acme` doesn't open and isn't remembered.
- Given the picked folder `acme`, and since then `XDG_DATA_HOME` is `acme/.data` on Linux,
  when Studio reopens `acme` after a restart,
  then it is refused as `profile_inside` with the reason `XDG_DATA_HOME`, and `acme` stays in the list.
- Given the folder `work` inside the profile folder,
  when the person picks it,
  then the pick is refused as `workspace_inside_profile`.
- Given `HALONIC_HOME` is `Documents/Acme/.profile`,
  when New workspace makes `Acme` in Documents,
  then it is refused as `profile_inside` and no folder is made.
- Given no variables,
  when the person picks their home folder,
  then it opens.
- Given `HALONIC_HOME` is `other/.profile`,
  when the page asks to trust `other`,
  then it is refused as `profile_inside` before the shell asks, and no record is saved.
