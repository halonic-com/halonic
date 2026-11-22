# Decision: C665 and C681 words for the Windows connector refusal, doctor's profile fix and the trust check

- Task: HAL-16065, from Sofia's words check C665 rows 57 and 90 (HAL-16044); HAL-16160, from Sofia's words check C681 rows 5, 7 and 44 to 46 (HAL-16153)
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-16065 (wording fixes in command output, so a team decision under the HAL-2282 rule, with the designer's words; Liam's code review signs this note)
- Kind: user-visible

## What changes

- `cli.local-integration-unfenced-yes` (edited): where Studio's yes doesn't reach the command (Windows with the WSL sandbox chosen or no choice saved) and no yes is saved, the refusal is R3's reason and fix for integrations, "Connector "notes" didn't start: on Windows, integration code can't run in the sandbox in this version of Halonic. Use Halonic inside WSL 2 on this computer.", in place of "the sandbox isn't available here (windows) and running without it isn't allowed yet." and HAL-16058's line that sent the run to Studio (C681 row 44): Studio's Run panel refuses an agent whose connector isn't `stdio` (`studio.engine-service`), and an integration's connector is `integration`, so that line sent the person round in a circle. For a yes it can't read there, the refusal names its file and ends with the same reason and fix. The example, the four tests and the quote in `docs/security/sandbox.md` (row 45) check the new words; nothing is weakened. Where Studio's yes reaches the command, the words stay as they are: their line about trusting the workspace is with Chief (C665 row 56). #5018's changeset now says so (row 46).
- `workspace.trust-check-unfenced-yes` (edited): when the host saved no yes and the status read again names the same reason (a Take back under way), focus moves to the unticked box and the dialog's polite region reads the reason once, as for a changed reason (C681 row 5, C665-54's second half); before, **Trust** stopped working without a word. The reason is read only once the status was read again, never the one shown before. The example and its test say so. #5033's changeset loses "agent host" and "words a failed yes" (row 7).
- `cli.commands.doctor.profile-line` (edited): when a variable put the profile in the workspace, the reasons are on the Profile line ("Your profile folder ~/acme/.profile is inside this workspace. XDG_DATA_HOME puts it there. A change to this workspace could change what you trust.") and the fix starts with a step: "Fix: move the profile folder out, then set HALONIC_HOME to its new place.". The tests check both lines whole, also for `HALONIC_HOME`.
- `cli.profile-outside-workspace` (draft): the refusal's fix ends "Move the profile folder out, then set HALONIC_HOME to its new place.".

## Why

The raw code "(windows)" told the person nothing and the line gave no next step (microcopy 22 E1, E2). Every other doctor fix starts with a step, and without Studio's third step ("then quit Halonic and open it again") the two steps were a comma splice.

## Covers

- cli.local-integration-unfenced-yes
- cli.commands.doctor.profile-line
- workspace.trust-check-unfenced-yes
