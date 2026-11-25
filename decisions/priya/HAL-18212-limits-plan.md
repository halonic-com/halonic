# Decision: one plan shape for a limits document

- Task: HAL-18212
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-18243 (Liam's decision: option 1)
- Kind: internal

## What changes

- A limits push whose `plan` has a `state` other than `none` keeps the plan as
  `{ id, version, name }`, without `state`, instead of only its name as `planName`. A plan in state
  `none`, or no plan, keeps no plan. A top-level `planName` in the pushed document is still dropped.
- `UsageLimits` has no `planName`. The summary's `planName` is the kept plan's name.
- One name rule: 1 to 200 characters, not only blanks, and no `\p{Cc}` or `\p{Cf}` characters. A
  malformed plan is a `bad_limits`.
- `runtime.limits-push-plan` and `cloudflare-durable.usage-summary` change their wording to match,
  and the tests from #5983 check the kept `plan` instead of `planName`. Both stay `Since: unreleased`.

## Rule

The limits document carries one plan object. A stop's detail and the account menu's summary read
the same object.

## Why

One plan shape: the stop detail and the summary read the same object. This replaces #5983's
`planName`-only handling before release. A bare `planName` next to the plan would keep two copies of
the name that could disagree.

## Covers

- runtime.limits-push-plan
- cloudflare-durable.usage-summary
