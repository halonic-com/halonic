# Decision: a done step on the Try the sample card does nothing

- Task: HAL-12728
- Approval: Sofia (design) decides on HAL-12728 (https://paperclip.halonic.com/HAL/issues/HAL-12728#comment-a6ee5482-a7de-4496-a726-1fd2db63d926) that a done row does nothing, in the sample as in Get set up; Liam signs on the same task. A team decision with no board card (HAL-2282 rule).
- Kind: user-visible

## What changes

The Try the sample card's steps now use Get set up's rows (`SetupSteps`). A done step has no
chevron, and pressing its row now does nothing. Before, it still opened its page: step 1, once
done, opened the Inbox again. A step still to do opens what it opened before. After Sofia's
second UX check, a done row also stops looking pressable (no hover or press tint, the default
cursor), and Tab enters the steps at the first step still to do.

The requirement `first-run.sample-card` says so and gains an example. In the sample card's test
"counts the done steps, marks them for a screen reader, and opens a step to do by its row", the
click on done step 1 now checks that nothing opens, and a click on step 2 checks that it opens.
No test was weakened or skipped.

## Why

Found in the UX check of #3732 (row L7.3 on HAL-12756). HAL-477 2.2 says a done Get set up row
does nothing, and first-run flow 3.3 says the sample's rows are exactly Get set up's. A done row
without a chevron that still opens a page reads as broken. Nothing is lost: once step 3 is done
the finished card replaces the rows.

## Covers

- first-run.sample-card
- packages/studio/features/first-run/src/ui/sample-card.test.tsx
