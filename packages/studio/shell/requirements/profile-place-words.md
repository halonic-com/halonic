# shell.profile-place-words

- Status: draft
- Since: unreleased
- Source: HAL-15201 (the shell refuses a folder for the profile folder's place); words decided by the team with Sofia on HAL-15232, built on microcopy 3.2 and the approved problem screens (HAL-2282)

When the shell refuses a folder as `profile_inside`, the shell package shall give the reason "your profile folder is inside it." and the fix "A change to this workspace could change what you trust. Move the profile folder out, set HALONIC_HOME to its new place, then quit Halonic and open it again.", led by "<variable> puts it there." when the refusal's reason names a variable other than `HALONIC_HOME`. When it refuses one as `workspace_inside_profile`, it shall give the reason "it's inside your profile folder, where Halonic keeps its own files." and the fix "Move the workspace out of it, then open it from its new place.", and a Recent row whose folder it is shall offer **Remove from Recent**, as for a folder that is gone. The refusal shall be read from the error a pick rejects with, or from the cause of the error a reopen rejects with. The welcome screen shall show the fix after "Can't open <folder>: <reason>" in the same message. The variable's name shall appear in the fix only, never in the reason.

## Examples

- Given a pick refused as `profile_inside` with the reason `HALONIC_HOME`,
  when the welcome screen shows it,
  then it says "Can't open the folder: your profile folder is inside it. A change to this workspace could change what you trust. Move the profile folder out, set HALONIC_HOME to its new place, then quit Halonic and open it again."
- Given a refusal as `profile_inside` with the reason `XDG_DATA_HOME`,
  when its fix is shown,
  then it starts "XDG_DATA_HOME puts it there." and still says to set HALONIC_HOME.
- Given the Recent row `acme`, whose reopen is refused as `workspace_inside_profile`,
  when the welcome screen shows the problem,
  then it offers **Remove from Recent**.
