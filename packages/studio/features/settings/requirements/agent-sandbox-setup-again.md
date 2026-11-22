# settings.agent-sandbox-setup-again

- Status: active
- Since: unreleased
- Source: HAL-5404; wording decided by the team (Noah, HAL-14804, under HAL-2282); design section 4 on HAL-3779

When the sandbox needs setting up and the check says its setup is on this computer but for an older release (`setupAgain`), Settings › Agent sandbox shall show "This version of Halonic needs the sandbox set up again. Windows asks for administrator rights once." under **Set up the sandbox**, in place of "Windows asks for administrator rights once.". The chip (**Needs setting up**) and the button stay the same.

## Examples

- Given a check that needs setup with `setupAgain`,
  when the section shows it,
  then the line under the button says the sandbox needs setting up again, and the chip and button don't change.
- Given a check that needs setup without `setupAgain` (never set up),
  when the section shows it,
  then the line under the button is "Windows asks for administrator rights once.".
