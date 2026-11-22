# settings.agent-sandbox-setup-again-lead

- Status: active
- Since: unreleased
- Source: flow check C634 #4 (HAL-15803), task HAL-15808; wording decided by the team (Maya, HAL-15808, under HAL-2282), next to Noah's line in `settings.agent-sandbox-setup-again` (HAL-14804)

When the sandbox needs setting up and the check says its setup is on this computer but for an older release (`setupAgain`), Settings › Agent sandbox shall lead with "The sandbox is set up for an older version of Halonic. Until it's set up again, agents set to run in a sandbox don't start." in place of the first-time lead "The sandbox needs a one-time setup with administrator rights. …", so the section doesn't call a second setup one-time.

## Examples

- Given a check that needs setup with `setupAgain`,
  when the section shows it,
  then the lead says the sandbox is set up for an older version, and doesn't say "one-time".
- Given a check that needs setup without `setupAgain` (never set up),
  when the section shows it,
  then the lead is "The sandbox needs a one-time setup with administrator rights. Until then, agents set to run in a sandbox don't start.".
