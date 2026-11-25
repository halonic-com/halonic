# Decision: no Markdown or HTML characters in a browser block's address or a guide's Open line

- Task: HAL-18106
- Approval: Liam approves this change on HAL-18106 (https://paperclip.halonic.com/HAL/issues/HAL-18106), a follow-up to his review finding on #5877 (HAL-17550). A team decision with no board card (HAL-2282 rule).
- Kind: internal

## What changes

`checkBrowserAddress` now refuses a `browser` block's address that holds any of `[ ] ( ) ! < >` or a
backtick, raw or percent-encoded in its path. The manual guide prints that address as is into a
Markdown card, so one of these could open or close a link, an image, a code span or an HTML tag there.
The manual guide also percent-encodes `! ' ( ) *` in a value filled into a catalog page's address,
which `encodeURIComponent` leaves as they are.

The requirements `action-steppers.stepper-request` and `action-steppers.manual-guide` are tightened to
say this, with one new example each. Nothing is loosened. In `validate-stepper-request.test.ts` the
row `javascript:alert(1)` now expects the new, earlier reason, and a row `javascript:alert%281%29`
keeps checking "isn't a web address". No test was weakened or skipped.

## Why

Liam's review finding on #5877: once the catalog lists browser origins (HAL-17518), a requester-chosen
address reaches the card. Both requirements are `Since: unreleased` and the CLI catalog is empty, so no
user sees a change.

## Covers

- action-steppers.stepper-request
- action-steppers.manual-guide
