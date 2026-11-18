# Decision: a version's page on a phone

- Task: HAL-1302 (T9, phone, audit item 8, third part)
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-1302 (checklist part 2, 2.14 and 2.12, from the board-approved phone design of source control)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:oQIlaBHf+O8+Rvc/R56rp6pyF0KqtCBXtWqMkIPJRBPznai/4VeFh8JnZnRtdvPun24twk8FXSvQkAEff7otBQ==

## What changes

The existing requirement `source-control.changes-phone` changes in one place:

- The sentence "While its phone layout is not built, the version page shall follow the desktop page." is replaced. On a phone a version in History now opens as its own page, in place of the Changes page: Back to History, the version's name as the heading (with focus), who made it and when, its notes and what's in it. Back to History puts focus on the version's row, and shows all of History when that row is past the newest 5.
- Two examples are added for this.

The desktop's details box beside History is unchanged; it now shares the who, when, notes and what's-in-it part with the phone page.

Nothing is removed from the behaviour; no test is weakened or deleted. Restore just this and the bottom bar's Go back to this version are not built yet, on desktop or phone; they come with the History actions.

## Why

On a phone there is no room for the details beside the list, so the checklist pushes the version as its own page (552 5.5), and Back returns to where the person was in History (552 5.6). The words "Back to History" follow the What changed page's "Back to Changes"; decided by the team.

## Covers

- source-control.changes-phone
