# Decision: an Undo held while the engine isn't answering says to press it again

- Approval: /HAL/issues/HAL-16633 (words check C735 row 22 on HAL-16630, team wording under HAL-2282)
- Kind: user-visible
- Task: HAL-16633

## What changes

`inbox.proposal-undo-held` merged in #5172 and is unreleased. When **Undo** is pressed on a run proposal's decision toast while the engine isn't answering, the toast "Couldn't undo this." said the page's line, "The engine isn't answering. Showing what it said last." It now says "The engine isn't answering. Press Undo again once it answers." The requirement's sentence and its first example change to match.

## Why

"Showing what it said last" describes the page, not the toast. The decision toast and its **Undo** stay, so the line tells the person they can press it again (C735 row 22).

## What doesn't change

- The title "Couldn't undo this." and the signed-out line "Sign in again to send your answer."
- What happens: nothing is sent, the toast stays, and **Undo** works again once the engine answers or the page has gone.
- No test is removed or weakened: the same test checks the new words.

## Covers

- inbox.proposal-undo-held
