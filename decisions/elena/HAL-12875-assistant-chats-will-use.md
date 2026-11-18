# Decision: the Assistant's not-set-up line says chats "will use" the model aliases

- Task: HAL-12875
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-12875 (claims check C88, HAL-12844, row 18; Chief's wording decision; small wording of an approved screen, team decision, HAL-2282 rule; follows HAL-12400; Liam's code review)
- Kind: user-visible

## What changes

With no provider, the line under Provider in Settings › Assistant (on the computer and in the view-only served
and phone views) now reads "Not set up. Assistant chats will use each workspace's model aliases." It used to
read "Not set up. Assistant chats use each workspace's model aliases."

The section's controls, the Ctrl K action and the served and phone views are otherwise unchanged. The
requirements' wording and the tests' expected text change to match. No test was weakened or skipped.

## Why

HAL-12400 changed the section's first line to say Halonic can't open assistant chats yet. The not-set-up line
still spoke of chats in the present, as if they ran. The claims check (C88, row 18) found the mismatch; "will
use" keeps the line true until assistant chats exist. This change was meant for PR #3752, which merged before
it could be pushed.

## Covers

- settings.ai-agent-section
- settings.ai-agent-view-only
