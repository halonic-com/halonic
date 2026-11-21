# Decision: Inbox's × says which notice it dismissed, as microcopy 19.4 has it

- Approval: HAL-15457 (row 20 of words check C580 on HAL-15449; a wording fix on an approved screen, decided by the team under HAL-2282); Liam approves this note in review
- Kind: user-visible

## What changes

`inbox.notices-section`: each × now says "Dismissed: *title*" politely, with that notice's
title, in place of "Notice dismissed.". That is the approved announcement in microcopy 19.4, row
"Notice dismissed", without a full stop. Focus moves as before. The example names the two
notices and the two lines said.

## Why

Focus moves straight to the next notice's ×, which says "Dismiss *next title*". With only
"Notice dismissed.", someone who dismisses several notices in a row can't tell which one just
went. C580 found the line didn't match microcopy 19.4.

## Tests

No test was weakened or skipped. `notices-section.test.tsx` now checks "Dismissed: Daily summary
failed at 06:00" and then "Dismissed: Weekly report failed at 07:00" for two dismisses in a row.

## Covers

- inbox.notices-section
