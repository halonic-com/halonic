# Decision: the usage banner says the real percent and a short reset date

- Task: HAL-20021
- Approval: the team decides this on HAL-20021 (https://paperclip.halonic.com/HAL/issues/HAL-20021#comment-35790baa-6c25-4ba5-8cba-3adae0a66fd8), taking both recommendations. A team decision with no board card (HAL-2282 rule).
- Kind: user-visible
- Signature: pending (the approver signs)

## What changes

The usage banner reads "You've used 95% of this month's tokens" with the warning's own percent,
not a fixed "80%". The reset day reads "2 Dec 2026" (UTC) instead of "2 December", the same style
as the connection row's "24 Dec 2026". The requirement `account-menu.usage-banner` says this, and
the words file and its test follow. No test was weakened or skipped.

## Why

A customer at 95% read "80%", a wrong number. Two date styles in one app looked unplanned.

## Covers

- account-menu.usage-banner
- packages/studio/features/account-menu/src/ui/usage-banner.test.tsx
