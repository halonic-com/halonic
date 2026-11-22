# settings.agent-sandbox-removal-result

- Status: draft
- Since: unreleased
- Source: HAL-15091 (Noah's check C539, S2 to S5, of #4396); HAL-14863; HAL-15430 (C576, rows 22 and 25); HAL-15432 (C575, findings 1 and 2); HAL-15438 (C574); HAL-15761 (C624 item 2); HAL-15836 (C636 item 2)

When **Remove sandbox** in the Remove dialog is pressed, Settings › Agent sandbox shall move focus to the removal's status, the step "Removing the agent sandbox…", and when the removal ends it shall show its result in a Callout, move focus to that Callout, which says its line, and say through the settings container's live region only what the Callout doesn't: nothing for a failure, and the first line of the state it left for a removal that worked, so that each line is said once. A removal the section only followed, because it was running when Settings opened, shall say its result through the live region alone: the Callout's line, or "Sandbox removed." and the first line of the state it left. The step shall wear the kit's focus ring. A removal that worked shall show the note "Sandbox removed." in the info tone; when the host says it kept some access until Halonic next starts (`keptAccess: "until_next_start"`, `sandbox-srt.removal-kept-access`), the note shall add "It still has access to your project folders until you quit Halonic and open it again normally, not as administrator."; when the host says it kept some access the next start doesn't end (`keptAccess: "manual"`), the note shall add "It may still have access to some of your project folders. To end that, remove the sandbox again without administrator rights: quit Halonic, open it again normally, not as administrator, then set the sandbox up again and remove it. Windows asks for administrator rights for each."; and the live region shall say the added sentence with "Sandbox removed." wherever it says that line. A removal the shell's time limit ended shall read "The sandbox wasn't removed within 5 minutes. Wait a minute, then try again.", and a removal that found the helper of an earlier one still running shall show the note "The earlier removal is still running. Wait a minute, then try again." in the info tone, not as a failure.

## Examples

- Given the sandbox is Ready,
  when the person presses **Remove the sandbox…**, then **Remove sandbox**,
  then focus is on the step "Removing the agent sandbox…".
- Given a removal is running,
  when it works and the check says the sandbox needs setting up,
  then the section shows the note "Sandbox removed.", focus is on it, and the live region says "The sandbox needs a one-time setup with administrator rights. Until then, agents set to run in a sandbox don't start." once.
- Given a removal is running,
  when it works but the host says it kept some access until the next start,
  then the note reads "Sandbox removed. It still has access to your project folders until you quit Halonic and open it again normally, not as administrator." and focus is on it.
- Given a removal is running,
  when it works but the host says it kept some access the next start doesn't end,
  then the note reads "Sandbox removed. It may still have access to some of your project folders. To end that, remove the sandbox again without administrator rights: quit Halonic, open it again normally, not as administrator, then set the sandbox up again and remove it. Windows asks for administrator rights for each." and focus is on it.
- Given a removal is running,
  when the shell's time limit ends it,
  then the Callout reads "The sandbox wasn't removed within 5 minutes. Wait a minute, then try again.", focus is on it, and the live region doesn't say the line again.
- Given the helper of an earlier removal still runs,
  when the removal ends,
  then the section shows "The earlier removal is still running. Wait a minute, then try again." as an info note.
