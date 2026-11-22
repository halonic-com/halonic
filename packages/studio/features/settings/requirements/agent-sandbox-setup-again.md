# settings.agent-sandbox-setup-again

- Status: active
- Since: unreleased
- Source: HAL-5404; wording decided by the team (Noah, HAL-14804, under HAL-2282; moved to the lead in C633, HAL-15815); design section 4 on HAL-3779

When the sandbox needs setting up and the check says its setup is on this computer but for an older release (`setupAgain`), Settings › Agent sandbox shall say "This version of Halonic needs the sandbox set up again, with administrator rights. Until then, agents set to run in a sandbox don't start." under the chip, in place of "The sandbox needs a one-time setup with administrator rights. Until then, agents set to run in a sandbox don't start.". The chip (**Needs setting up**), the button and the line under it ("Windows asks for administrator rights once.") stay the same.

## Examples

- Given a check that needs setup with `setupAgain`,
  when the section shows it,
  then the line under the chip says this version of Halonic needs the sandbox set up again, and the chip, the button and the line under it ("Windows asks for administrator rights once.") don't change.
- Given a check that needs setup without `setupAgain` (never set up),
  when the section shows it,
  then the line under the chip says the sandbox needs a one-time setup, and the line under the button is "Windows asks for administrator rights once.".
