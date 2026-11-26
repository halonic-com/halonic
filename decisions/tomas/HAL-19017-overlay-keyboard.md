# Decision: select an area on the feedback overlay with Enter or with two clicks

- Task: HAL-19017
- Approval: Sofia decided the behaviour and the words on HAL-19017 (https://paperclip.halonic.com/HAL/issues/HAL-19017), under the board's "Sofia and Tomas decide details" on HAL-18562. A team decision with no board card (HAL-2282 rule).
- Kind: user-visible

## What changes

The feedback overlay took a box only by dragging. Now Enter, while no box is being drawn, selects
the whole screen the overlay is on, and a click, a move and a second click draw a box the same way
a drag does, under the same 8 × 8 rule. The hint names the Enter key: "Drag to select an area ·
Enter for the whole screen · Esc to cancel".

The requirement `feedback.overlay` is updated to say this: the sentence "When the person lets go
of a smaller box or clicks, the feature shall call nothing" is replaced, and an example is added
for Enter and for two clicks. The test for a click that did nothing now shows that a two-click box
under 8 × 8 does nothing; tests for Enter and for two clicks are added. No test was weakened or
skipped.

## Why

Found in Sofia's accessibility check of #6284 (HAL-19015): a keyboard user, or a pointer user who
can't drag, couldn't send screenshot feedback at all (WCAG 2.1.1 and 2.5.7).

## Covers

- feedback.overlay
