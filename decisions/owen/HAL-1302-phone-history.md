# Decision: on a phone, History shows the newest 5 versions and a See all history row

- Task: HAL-1302 (T9, phone, audit item 8, first part)
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-1302 (checklist part 2, 2.12, from the board-approved phone design of source control)
- Kind: user-visible

## What changes

The existing requirement `source-control.changes-phone` gains one sentence: on a phone, History shows the newest 5 versions and then a full-width 48px row, See all history, that shows the rest. Show more is unchanged and only appears after that. A history of 5 or fewer shows no See all history. Nothing was removed. The chevrons, the "Not shared yet" chip and the pushed pages follow in later pull requests.

## Why

The phone checklist asks for a short History on a small screen, with the full list one press away.

## Covers

- source-control.changes-phone
