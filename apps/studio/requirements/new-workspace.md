# studio.new-workspace

- Status: active
- Since: 0.1.0
- Source: HAL-1291 (T3 part 3), HAL-8714, flow-workspace 2.3; shell commands HAL-8745

The desktop app shall give the workspace window a New workspace host (`workspace.new-workspace-dialog`). Its default parent shall be the folder the shell's `documents_folder` answers, and **Change…** shall show the shell's `pick_parent_folder`. **Create** shall make the folder through the shell's `create_workspace_folder`, lay the workspace out in it with `createWorkspace`, the template `halonic init` uses, and, when the template wrote every file, save the person's trust in exactly what the folder holds. If the shell refuses, or writing fails, it shall reject with the reason so the dialog can show it. If saving the trust fails, the workspace shall still be created and open untrusted, and the result shall say why.

A folder that is already there is read by name only and opened only after the shell asks the person to trust it (HAL-8859). **Open it** opens a workspace through that question; **Create here** adds the missing files after it and opens the folder untrusted, because Halonic didn't write all that it holds, unless the folder was empty: then the template wrote everything in it and it is trusted at once, like a new folder. A refusal the shell doesn't name shall be shown as the shell gave it, and a name problem shall be marked for the name field. If the person says no, nothing is written.

## Examples

- Given the parent is Documents and the name is `Acme Support`,
  when **Create** is pressed,
  then `Acme Support` is made in Documents, holds a `workspace.yaml` and a `.gitignore`, and counts as trusted.
- Given a folder named `Acme Support` is already in Documents,
  when **Create** is pressed,
  then nothing is written and the dialog says "Can't write to this folder: a folder with that name is already there."
- Given the folder was made but the trust record can't be saved,
  then the workspace opens untrusted and the toast says why.
