# Decision: where Studio's yes doesn't reach the command, its refusal sends the run to Studio

- Task: HAL-16058, from flow check C666 #3 (HAL-16045)
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-16058 (a fix line for an approved refusal, so a team decision under the HAL-2282 rule; Liam's code review signs this note)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:ygxTVsT+bySYPR+isx8wxxZciti1O9kBhRVXMKpoyFqR1pul+MuK8ISlOBcKyWHAajpiTOse3NqXNloFZhkpCw==

## What changes

- `cli.local-integration-unfenced-yes` (edited): on Windows with the WSL sandbox chosen or no choice saved, and when the saved choice can't be read, the refusal no longer stops at "… running without it isn't allowed yet." (or "… so nothing runs." for a yes it can't read). It ends with "Start the run in Halonic Studio, where you can allow it: on this computer, the halonic command can't see a yes given in Studio.", where the other computers get "To allow it, trust this workspace in Studio on this computer." The example says so. The tests that expected no line now expect it, and a new one checks it after an unreadable yes.
- `format.integration-host-class`: #4813 pasted the same refusal test under three `verifies` blocks. The copy under this requirement checks nothing about host names, and the same test stays under `cli.local-integration-unfenced-yes` and `cli.open-local-integration`, so it goes. That also keeps `open-local-integration.test.ts` at 473 lines, under the 480-line headroom.
- `cli.open-local-integration`: its copy of that test expects the new line.

## Why

C612 (HAL-15675) took out "trust this workspace in Studio" because the command can't see that yes, and left the refusal with no next step, while Studio says "You allowed plugins and integrations to run without the sandbox …". The person can still run the workflow: Studio's runs use the yes. The line names that and why, in the shape of the plugin's "Or allow this in the Halonic desktop app: … The halonic command runs plugin code only in the sandbox."

## Decided by the team

- One line for every reason: on such a computer the command never sees the yes, whatever the reason.
- Studio's trust check keeps its words. It doesn't know which terminal the person will use, and `docs/security/sandbox.md` and `trust.md` now say that the yes reaches Studio only.

## Covers

- cli.local-integration-unfenced-yes
- format.integration-host-class
- cli.open-local-integration
