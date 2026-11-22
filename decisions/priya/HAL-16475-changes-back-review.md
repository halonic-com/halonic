# Decision: a Remove that finds the changes back shows them again

- Task: HAL-16475
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-16475 (Chief's fix from visual check C711 rows 4 to 6, a team decision under the HAL-2282 rule)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:p6LEe3XHOEI+7xc7g8Kck0Lik64okhHP1SwEbKRxbIibVTvaAlfwAkGL2ZEwgpU5U7CcKNDdbzrUNo2Y65TSCg==

## What changes

When the host refuses **Remove from Inbox** because the run's changes are there again, the page
said they were deleted and, in red, that they were back, with nothing left to press. Now it reads
the proposal again and shows the changes with Accept and Reject, under "Run 01JD8Q's changes are
there again. Review them below.", which takes focus. Only when that read fails does the old red
line stay, and it now takes focus so focus never falls to the page.

The gone line keeps 20 rem before the button wraps under it. While the engine isn't answering,
**Try again** goes: **Remove from Inbox** stays and is the retry.

The requirement `inbox.proposal-page-states` changes its wording and examples for these cases.
The test for the engine that isn't answering now presses **Remove from Inbox** instead of
**Try again**. No test was weakened or skipped.

## Why

The two lines contradicted each other and left a dead end (C711 4). The squeezed line was four
lines tall at 720 px (C711 5). Two buttons did the same thing (C711 6).

## Covers

- inbox.proposal-page-states
