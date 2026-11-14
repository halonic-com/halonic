# studio.new-workspace

- Status: active
- Since: 0.1.0
- Source: HAL-1291 (T3 part 3), HAL-8714, flow-workspace 2.3; shell commands HAL-8745

The desktop app shall give the workspace window a New workspace host (`workspace.new-workspace-dialog`). Its default parent shall be the folder the shell's `documents_folder` answers, and **Change…** shall show the shell's `pick_parent_folder`. **Create** shall make the folder through the shell's `create_workspace_folder`, lay the workspace out in it with `createWorkspace`, the template `halonic init` uses, and, when the template wrote every file, save the person's trust in exactly what the folder holds. If the shell refuses, or writing fails, it shall reject with the reason so the dialog can show it. If saving the trust fails, the workspace shall still be created and open untrusted, and the result shall say why.

Not yet: the shell never adopts a folder that exists, so a folder that is already there can't be created in or opened from this dialog. The app reports it as "a folder with that name is already there" (the dialog's **Create here** and **Open it** wait for a shell command that adopts it, HAL-8714).

## Examples

- Given the parent is Documents and the name is `Acme Support`,
  when **Create** is pressed,
  then `Acme Support` is made in Documents, holds a `workspace.yaml` and a `.gitignore`, and counts as trusted.
- Given a folder named `Acme Support` is already in Documents,
  when **Create** is pressed,
  then nothing is written and the dialog says "Can't write to this folder: a folder with that name is already there."
- Given the folder was made but the trust record can't be saved,
  then the workspace opens untrusted and the toast says why.
