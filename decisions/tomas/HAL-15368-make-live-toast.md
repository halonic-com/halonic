# Decision: Create version says what Review and make live makes live

- Task: HAL-15368
- Approval: Sofia decides the wording on HAL-15368 (https://paperclip.halonic.com/HAL/issues/HAL-15368#comment-5068ce9d-03d2-422f-8f2b-6a4ee7877fcf), from the flow check C548 4 on HAL-15204. A team decision with no board card (HAL-2282 rule).
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:f2Oa/oPGbnoyjH6/4+juodEj4R8dSAPzCUeFhCeNVdJGKPB5/ab4HCKt7h4mYeve/4LY+Vps2rzmiEs4f/M5Cw==

## What changes

When **Review and make live** on a routine's or an agent's page opens Create version, it now
passes the routine's or agent's name. Create version then says "Creating this version makes
{name} live." under its title, as the dialog's description, and once the version is made its one
success toast says "{name} is live." with `Version "{version}"` on its second line, instead of
`Created version "{version}"`. Without a name, Create version is as before.

The requirement `source-control.create-version-elsewhere` gets that sentence and an example; the
draft requirements `routines.page.review-and-make-live` and `agents.page.review-and-make-live` say
the page passes the name. No test was weakened or skipped; tests for the line, its description and
the toast are added, and the make-live tests now check the name is passed. The two make-live
tests of `apps/studio/src/routines/workspace-routines.test.ts` move unchanged in meaning to
`workspace-routines-make-live.test.ts` (with the name check), because the old file would pass
the 500-line limit.

## Why

Found in the flow check C548 on HAL-15204: the button says "make live", but the dialog it opens
never says "live", and after the version is made nothing confirms the routine is live; the line
just goes away. One toast replaces the existing one, so the action doesn't stack two.

## Covers

- source-control.create-version-elsewhere
- apps/studio/src/routines/workspace-routines.test.ts
