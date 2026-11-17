# Decision: requirements written after a release say `Since: unreleased`

- Task: HAL-11580
- Approval: Liam asked for this change on HAL-11580 (https://paperclip.halonic.com/HAL/issues/HAL-11580). A team decision with no board card.
- Kind: user-visible

## What changes

The 876 requirement files added after `v0.1.0` said `Since: 0.1.0`, or a guessed `0.1.2` or
`0.2.0`; they now say `Since: unreleased`. The trace check already accepts that value (pull
request #3309). The release replaces it with the real version. No requirement text, status or
test changes, and no test was weakened or skipped.

## Why

Work after the tag isn't in 0.1.0, and the next version isn't decided. The wrong `Since` made the
FAQ fact-check (HAL-11579) read main as 0.1.0.

## Covers

- tooling/check/
