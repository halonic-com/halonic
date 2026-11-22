# Decision: the phone's Rename sheet focuses Name, and Run now's toast names the engine's refusal

- Task: HAL-15336
- Approval: Sofia's Routines UX check, RT17 (https://paperclip.halonic.com/HAL/issues/HAL-15304#document-ux-check), assigned on HAL-15336. A team decision on an approved screen, with no board card (HAL-2282 rule). Liam approves it in the review of this pull request.
- Kind: user-visible

## What changes

On a phone, the Rename sheet from an item page's ⋮ (routines, collections) now gives the focus to
its **Name** field with the name selected, so typing replaces it. Before, it focused the sheet's
title, and a person had to move to the field first.

When **Run now** fails, its toast now keeps the engine's own sentence for a refused input (for
example "The input has no field mail, which the step Read the email reads."), says "The engine
isn't answering. It may still be starting." only when the engine can't be reached, and says
Halonic can't explain a failure that has no reason. The active requirement
`routines.page.run-now-failed` is updated to say this; its existing behaviour (the shared
start-failure line, **Copy command**, **Try again** only when starting again may help) is
unchanged. Its tests gain cases for these sentences; none was removed, weakened or skipped.

The active requirement `shell.rename-sheet` is updated to say this. Its phone test now checks
that Name has the focus with its text selected, instead of the title; it still checks ✕ and
**Rename**. No test was removed, weakened or skipped.

## Why

Component specs 15.3: a form sheet focuses its first field, as New routine does. Found as RT17 in
Sofia's UX check of the Routines area (HAL-15304). The Run now wording is RT3 and RT4 of the same
check, and S5 of the UX check on HAL-12390: a refusal said the engine wasn't answering, which was
false.

## Covers

- routines.page.run-now-failed
- shell.rename-sheet
