# Decision: Getting updates says there's nothing to choose when no item changed on both sides

- Task: HAL-13042
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-13042 (Sofia's C117 check, G3: a fallback line on the approved Changes screen, a team decision under HAL-2282)
- Kind: user-visible
- Signature:

## What changes

When both sides have new versions but no item changed on both sides (the common case: two people
changed different files), the intro under "Getting updates" now says "You and Sam changed different
items, so there's nothing to choose. Finish getting updates to bring theirs in." ("the team" when
more than one person's versions came). Before, it said "You and Sam both changed 0 items. Choose
which one to keep. Your version is kept in History either way." One item or more keeps those words.
The requirement `source-control.get-updates-per-item` gets the new line and one example for it.

## Why

The old line asked for a choice that doesn't exist (UX check rule N5). The new one says what
happened and the one thing to do. The History sentence is left out, because nothing of yours is
replaced.

No test was weakened or removed; two tests were added.

## Covers

- source-control.get-updates-per-item
