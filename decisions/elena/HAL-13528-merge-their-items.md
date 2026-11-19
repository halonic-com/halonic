# Decision: while getting updates, the other person's items aren't listed as your changes

- Task: HAL-13528
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-13528 (Sofia's HAL-13469 check, GU3: a state of the approved Changes screen with no new words, a team decision under HAL-2282)
- Kind: user-visible

## What changes

While a merge of both sides' versions is open, the files Halonic brought in because only the
shared copy changed them (Sam's items) are no longer read as changes since the last version. So
"Since your last version" doesn't list them and the sidebar's Changes count doesn't count them.
They come in with Finish getting updates and show in History as theirs. The person's own unsaved
changes stay listed as before, and so does a brought-in file the person edits again.

The requirement `source-control.get-updates-per-item` gets the new sentence and one example for it.

## Why

The list said the other person's change was the person's own, which contradicts the intro line
("You and Sam changed different items"). Nothing could be lost (Undo these changes was already
unavailable during a merge), but the list said something untrue.

No test was weakened or removed; one test was added.

## Covers

- source-control.get-updates-per-item
