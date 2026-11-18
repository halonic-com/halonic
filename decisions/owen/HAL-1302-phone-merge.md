# Decision: Get updates on a phone

- Task: HAL-1302 (T9, phone, audit item 8, last part)
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-1302 (checklist part 2, 2.14 and 2.12, from the board-approved phone design of source control)
- Kind: user-visible

## What changes

The existing requirement `source-control.changes-phone` gains one paragraph and two examples, and nothing in it is removed:

- On a phone, the Get updates choices (the per-item Keep mine, Use Sam's and Keep both of `source-control.get-updates-per-item`) open as their own page in place of the Changes page: Back to Changes, "Getting updates" as the heading with focus, and each item's tiles stacked with Yours first.
- "Choose for 1 more item.", Finish getting updates and Cancel getting updates move into the phone's bottom bar. Finish stays unavailable with that line as its reason until every item is chosen.
- Back to Changes keeps the merge started: the Changes page shows "You're in the middle of getting Sam's updates." with Continue, and focus goes to its heading. Continue brings the choices back as they were left.

The desktop is unchanged: the choices stay inline on the Changes page. The only shared change is that on the phone page the headings go one level up (page h1, item h2, tile h3), so no level is skipped.

No test is weakened or deleted.

## Why

The checklist pushes "Get Sam's updates" as its own page on a phone, with the tiles stacked, the bar's line "Choose for 1 more item.", Finish (`aria-disabled`, that line as its description) and Cancel, and says Back keeps the merge started (552 5.4, 5.6; a11y 13.6). The page's heading keeps the desktop's existing words, "Getting updates", so no new wording is added. Focus goes to the Changes page's heading after Back, since the strip's Continue has no handle to focus; decided by the team.

Not built here, because the screens they sit on aren't built yet: the "Finish getting updates first." line in a version page's bottom bar (that bar comes with the History actions).

## Covers

- source-control.changes-phone
