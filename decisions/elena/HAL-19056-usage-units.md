# Decision: the usage summary gives each limited unit's percent, and the runtime sends it as `units`

- Requirements: `cloudflare-durable.usage-summary`
  (`packages/adapters/cloudflare-durable/requirements/usage-summary.md`), `runtime.account-usage`
  (`packages/targets/cloudflare/runtime/requirements/account-usage.md`)
- Task: HAL-19056, the follow-up named on HAL-19052 (S3-11 PR 3)
- Approval: Liam approves this note in his review of this pull request on HAL-19056
- Kind: internal

## What changes

HAL-19052 gave `host/server`'s `AccountUsage` an optional `units` list and the account menu its
`warnings`, which the app's 80% banner reads. The Cloudflare runtime didn't fill `units`, so on a
deployment the banner never showed.

- `cloudflare-durable.usage-summary`: the usage object's summary also gives `units`, the percent
  spent of each unit that has a limit, in the account's unit order. It is counted as the cost
  percent already is: whole, rounded down, at most 100, and 100 for a limit of 0. With no limits,
  or limits whose period has ended, the list is empty. The cost percent now comes from the same
  count, so it can't drift from the cost unit.
- `runtime.account-usage`: the hook answers those units as `units`, each with the period's end as
  `resetsAt` in ISO 8601. The menu's own rule (80% or more and under 100) picks the warnings, so
  the runtime sends every limited unit and decides nothing about the banner.

## Tests

No test was weakened. The summary's existing `toEqual` checks, in `usage-summary.test.ts`,
`test/usage-summary.spec.ts`, `account-usage-calls.test.ts` and `test/account-usage.spec.ts`, now
also name the new `units` field with its expected values. New: `usage-summary.test.ts` checks each
unit's percent (rounded down, capped, a limit of 0); `account-usage-calls.test.ts` checks the
mapping to `units` and that no limits give no units; the new `test/account-menu.spec.ts` serves
`GET /api/account-menu` from a many-user `host/server` with a Cloud session verifier and the
runtime's hook over a real `UsageObject` in workerd, and agent time at 82% comes back in
`warnings` with the period's end.

## Covers

- cloudflare-durable.usage-summary
- runtime.account-usage
