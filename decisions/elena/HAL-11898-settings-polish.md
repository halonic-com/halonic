# Decision: the Formats select shows a short name for the followed format

- Task: HAL-11898 (item 1)
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-11898 (Noah's look review and Liam's code review of #3401; a small detail of an approved screen, team decision, HAL-2282 rule)
- Kind: user-visible
- Signature: 

## What changes

The first option of the Formats select reads "Follow this computer: English (UK)" instead of "Follow this
computer: English (United Kingdom)". The followed name now uses the short style of Intl.DisplayNames. The
other options keep their full names. The requirements `settings.formats-format` and
`settings.formats-section` change their examples to match. No test was weakened or skipped.

## Why

The Settings right column is 360px by spec, so the select cannot be widened. The long name was cut off
("English (United Kingdor…") in the #3401 screenshots.

## Covers

- settings.formats-format
- settings.formats-section
