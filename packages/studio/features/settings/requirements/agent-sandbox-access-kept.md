# settings.agent-sandbox-access-kept

- Status: active
- Since: unreleased
- Source: HAL-16593 (C728-1 of flow check 76, on #5150); HAL-15851; wording decided by the team (Mateo with Noah, under HAL-2282)

While the sandbox needs setting up and the check says a removal with administrator rights left some access (`accessKept`), Settings › Agent sandbox shall say why it offers **Remove the sandbox…**: under the line under the chip, "The sandbox still has access to some of your project folders. To end it, remove the sandbox.", which served Studio, without the button, shall not show. Its Remove dialog shall then read "This ends the access the sandbox still has to some of your project folders. Halonic must be open normally, not as administrator. Windows asks for administrator rights once." in place of "Agents set to run in a sandbox won't start until you set it up again. Windows asks for administrator rights once.", since agents already don't start.

## Examples

- Given the check says the sandbox needs setting up with `accessKept`,
  when the section shows it,
  then under the line under the chip it reads "The sandbox still has access to some of your project folders. To end it, remove the sandbox."
- Given the same check in served Studio,
  when the section shows it,
  then that line doesn't show.
- Given the check says the sandbox needs setting up with `accessKept`,
  when **Remove the sandbox…** is pressed,
  then the dialog says removing ends the access the sandbox still has, and that Halonic must be open normally, not as administrator.
- Given the sandbox is Ready,
  when **Remove the sandbox…** is pressed,
  then the dialog says agents set to run in a sandbox won't start until it is set up again.
