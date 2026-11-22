# fs-tauri.profile-place-refusals

- Status: draft
- Since: unreleased
- Source: HAL-15201 (the shell refuses a folder for the profile folder's place, `studio.src-tauri.crates.trust-grant.profile-place`)

The adapter shall know the shell's refusals `profile_inside` and `workspace_inside_profile` as trust refusals, with the variable that moved the profile as the refusal's `reason`. When `reopen_folder` refuses with one of them, the picked folders shall reject with a `denied` error that keeps the refusal as its cause, so the page can tell why.

## Examples

- Given the shell refuses `reopen_folder` as `workspace_inside_profile`,
  when the page reopens that folder,
  then it rejects with a `denied` error whose cause is the refusal.
