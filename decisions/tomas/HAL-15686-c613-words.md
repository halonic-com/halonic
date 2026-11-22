# Decision: the for-each wait refusal's words, and Run now's next step for a missing input field

- Task: HAL-15686
- Approval: Sofia's words check C613, rows 23 and 43 (https://paperclip.halonic.com/HAL/issues/HAL-15673#document-c613), assigned on HAL-15686, and words check C625, row 51 (https://paperclip.halonic.com/HAL/issues/HAL-15749#document-c625), assigned on HAL-15768. A team decision on approved screens and command output, with no board card (HAL-2282 rule). Liam approves it in the review of this pull request.
- Kind: user-visible

## What changes

`halonic validate` and Studio's Problems now say, for `foreach-child-waits`: "For-each step "each"
runs "review-one" once for each item, and a run for one item can't wait, but "review-one" has the
wait step "approve". Move "approve" into this workflow after "each", or take it out of
"review-one"." Before, the message ended "so the run fails there" and "Move the wait step after
"each"". The active requirement `workspace.foreach-child-waits` gets the new message in its text
and its example; its test checks the new words. Nothing else about the check changes.

The same message for a wait step further down, through `workflow` steps
(`workspace.foreach-nested-waits`), gets the same shape: "…but "review-one" runs "sign-off", which
has the wait step "approve". Move "approve" into this workflow after "each", or take it out of
"sign-off"." Before, it ended "and an item's run can't wait, so the run fails there. Move the wait
step after "each", …". That active requirement, unreleased, gets the new message in its text and
its example; its test checks the new words, and a new test checks the form two workflows down.

When **Run now** fails because the engine refuses an input that lacks a field, the toast now adds
the next step: "The input has no field mail, which the step Read the email reads. Fill it in under
Starts on the routine's page.", with no **Try again**. The active requirement
`routines.page.run-now-failed` and the draft `studio.workspace-routines-start-input` say this, each
with a new example; their tests check the next step and that **Try again** is gone, and a new test
checks that any other refusal of the input gets no next step. No test was removed, weakened or
skipped.

## Why

C613 row 43: the error now stops the run before it starts, so "so the run fails there" no longer
happens; "Move the wait step after each" didn't say the step moves into the outer workflow; "an
item's run" is our own word. C625 row 51: the nested form had the same two problems, and "Move the
wait step after each" is even less clear two workflows down. C613 row 23: the toast gave the reason
but no next step, which E2 asks for, and the routine page now marks the field under Starts; nothing changes until the field
is filled, so **Try again** would only fail again.

## Covers

- workspace.foreach-child-waits
- workspace.foreach-nested-waits
- routines.page.run-now-failed
- studio.workspace-routines-start-input
