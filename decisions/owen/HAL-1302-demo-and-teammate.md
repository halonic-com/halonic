# Decision: Get updates names who recorded the versions it got

- Task: HAL-1302 (T9)
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-1360 (ux-checklists-t8-t9, part 2, 2.8 and decision C-D4)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:1AeyWHMy+q3SPYnzDEcmPMROs7+XL8WAdLhPPza8bxOLfs7cNubFHXPnGBsmGrTCtMgTM33Bq1Gsgl4QUk9XDg==

## What changes

`source-control.get-updates` said the fast-forward toast is "Got 2 versions from the shared copy". It now names who recorded the versions, as checklist 2.8 and decision C-D4 ask: "Got 2 versions from Sam", "Got 3 versions from the team" when more than one person recorded them (the same "the team" the per-item page uses), and "Got 1 version from the shared copy" only when git names nobody. The first example now says "from Sam", and one example is added for more than one person. No example is removed and no test is weakened: the tests that checked "from the shared copy" now check the names, and new tests cover the team and the fallback, plus a real-git test that reads the names oldest first.

## Why

The checklist and the microcopy decision give the teammate's name; "the shared copy" was a stand-in until the source said who recorded the versions. The per-item page already names the teammate the same way, so both paths now read alike.

## Covers

- source-control.get-updates
