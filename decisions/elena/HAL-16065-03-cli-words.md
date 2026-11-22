# Decision: C665 words for the Windows connector refusal and doctor's profile fix

- Task: HAL-16065, from Sofia's words check C665 rows 57 and 90 (HAL-16044)
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-16065 (wording fixes in command output, so a team decision under the HAL-2282 rule, with the designer's words; Liam's code review signs this note)
- Kind: user-visible

## What changes

- `cli.local-integration-unfenced-yes` (edited): where Studio's yes doesn't reach the command (Windows with the WSL sandbox chosen or no choice saved) and no yes is saved, the refusal gives R3's reason and fix for integrations, "Connector "notes" didn't start: on Windows, integration code can't run in the sandbox in this version of Halonic. Use Halonic inside WSL 2 on this computer.", in place of "the sandbox isn't available here (windows) and running without it isn't allowed yet.", then the line from HAL-16058 that sends the run to Studio. The example and the two tests check the new words; nothing is weakened. Where Studio's yes reaches the command, and for a yes that can't be read, the words stay as they are: their line about trusting the workspace is with Chief (C665 row 56).
- `cli.commands.doctor.profile-line` (edited): when a variable put the profile in the workspace, the reasons are on the Profile line ("Your profile folder ~/acme/.profile is inside this workspace. XDG_DATA_HOME puts it there. A change to this workspace could change what you trust.") and the fix starts with a step: "Fix: move the profile folder out, then set HALONIC_HOME to its new place.". The tests check both lines whole, also for `HALONIC_HOME`.
- `cli.profile-outside-workspace` (draft): the refusal's fix ends "Move the profile folder out, then set HALONIC_HOME to its new place.".

## Why

The raw code "(windows)" told the person nothing and the line gave no next step (microcopy 22 E1, E2). Every other doctor fix starts with a step, and without Studio's third step ("then quit Halonic and open it again") the two steps were a comma splice.

## Covers

- cli.local-integration-unfenced-yes
- cli.commands.doctor.profile-line
