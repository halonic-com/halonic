# settings.agent-sandbox-removal-result

- Status: draft
- Since: unreleased
- Source: HAL-15091 (Noah's check C539, S2 to S5, of #4396); HAL-14863

When **Remove sandbox** in the Remove dialog is pressed, Settings › Agent sandbox shall move focus to the removal's status, the step "Removing the agent sandbox…", and when the removal ends it shall say the result once through the settings container's live region: the Callout's line, or, for a removal that worked, the first line of the state it left. A removal the shell's time limit ended shall read "The sandbox wasn't removed: the removal didn't finish within 5 minutes.", and a removal that found the helper of an earlier one still running shall show the note "The earlier removal is still running. Wait a minute, then try again." in the info tone, not as a failure.

## Examples

- Given the sandbox is Ready,
  when the person presses **Remove the sandbox…**, then **Remove sandbox**,
  then focus is on the step "Removing the agent sandbox…".
- Given a removal is running,
  when it works and the check says the sandbox needs setting up,
  then the section says "The sandbox needs a one-time setup with administrator rights. Until then, agents set to run in a sandbox don't start." once.
- Given a removal is running,
  when the shell's time limit ends it,
  then the Callout reads "The sandbox wasn't removed: the removal didn't finish within 5 minutes." and the section says that line once.
- Given the helper of an earlier removal still runs,
  when the removal ends,
  then the section shows "The earlier removal is still running. Wait a minute, then try again." as an info note.
