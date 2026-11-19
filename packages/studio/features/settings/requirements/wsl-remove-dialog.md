# settings.wsl-remove-dialog

- Status: active
- Since: unreleased
- Source: HAL-10974 (HAL-5402 part 3); board decision HAL-11014; wording HAL-11015

The Settings feature shall show, in Agent sandbox, the line "Deletes Halonic's sandbox from this computer. You can set it up again later." and the button **Remove sandbox setup**, only when the app's sandbox host can remove the WSL setup and Studio is not served to another device. The button shall open a dialog in three steps: what will happen (**Continue**, **Cancel**), then "What should happen to the sandbox contents?" with two choices, **Save a backup, then remove** and **Remove without a backup**, none picked at first, then progress and the result. Until a choice is picked, **Remove sandbox** shall be unavailable and the dialog shall say "Choose what happens to the contents first." Nothing shall be removed before the confirming button of the second step. **Save a backup, then remove** shall ask the host for a backup file and remove only after the host has saved it; when the backup fails nothing is removed and the dialog says so. Once removal starts the dialog shall offer no way out until the host answers. When the sandbox is removed, the dialog shall say "Sandbox removed" with **Show in folder** and **Done** when a backup was saved, and with **Close** as its only button when not. After a removal the section shall check the sandbox again.

## Examples

- Given the host can't remove the WSL setup,
  when the section opens,
  then **Remove sandbox setup** is not shown.
- Given the dialog is on its second step and nothing is picked,
  when the person looks at the confirming button,
  then it reads **Remove sandbox** and removes nothing.
- Given the person picks **Remove without a backup** and confirms,
  when the host answers that it removed the setup,
  then the dialog reads "Sandbox removed".
- Given the person picks **Save a backup, then remove** and the backup fails,
  when the host answers,
  then the dialog reads "The backup didn't work, so nothing was removed".
- Given the dialog is on its second step and nothing is picked,
  when the person looks at the choices,
  then there are two, none is picked, **Remove sandbox** is unavailable and the dialog says "Choose what happens to the contents first."
- Given the host answers that it removed the setup,
  when the dialog shows the result,
  then it announces "Sandbox removed".
- Given the person removed the sandbox without a backup,
  when the dialog shows the result,
  then **Close** is its only button.
