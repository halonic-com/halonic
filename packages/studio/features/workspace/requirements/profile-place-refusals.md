# workspace.profile-place-refusals

- Status: draft
- Since: unreleased
- Source: HAL-15201 (the shell refuses a folder for the profile folder's place); words decided by the team with Sofia on HAL-15232

When a folder opened from the workspace menu is refused for the profile folder's place, the switcher shall show the fix of `shell.profile-place-words` as the danger toast's text under "Can't open <folder>: <reason>", and, for a Recent row refused as `workspace_inside_profile`, offer **Remove from Recent** as the toast's action. When the shell refuses New workspace as `profile_inside`, the New workspace dialog shall say "Can't write to this folder: your profile folder would be inside it." under **Folder**, followed in the same paragraph by that fix.

## Examples

- Given the Recent row `/work/acme`, whose reopen is refused as `workspace_inside_profile`,
  when the person opens it from the workspace menu,
  then the toast says "Can't open /work/acme: it's inside your profile folder, where Halonic keeps its own files." with the text "Move the workspace out of it, then open it from its new place." and offers **Remove from Recent**.
- Given `HALONIC_HOME` inside the folder the dialog would make,
  when the person presses Create,
  then the dialog says "Can't write to this folder: your profile folder would be inside it." and the fix.
