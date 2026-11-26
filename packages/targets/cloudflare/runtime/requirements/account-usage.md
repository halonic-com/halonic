# runtime.account-usage

- Status: active
- Since: unreleased
- Source: HAL-18957 (follow-up to HAL-18215); selling layer S2-25 (HAL-12478)

When a many-user deployment has the `USAGE` binding, the runtime shall give `host/server`'s `ManyUserPorts` an `accountUsage` hook that reads the principal's scope's usage object summary and answers its plan name as `plan` and its cost percent as `usedPercent`. When the summary fails, the hook shall fail, so the account menu never shows a wrong plan. When the deployment has no `USAGE` binding, the runtime shall give no hook, so the menu shows no plan and no percent.

Rationale: the usage object already keeps each scope's plan and spending for Cloud to bill, so the account menu reads the same figures the meter stops on, from the principal's own scope only.

## Examples

- Given a scope on the Pro plan with a cost limit of 1,000 that spent 425, then the hook answers `{ plan: "Pro", usedPercent: 42 }`.
- Given a scope whose usage object was never given limits, then the hook answers `{ plan: null, usedPercent: null }`.
- Given a usage object that throws, then the hook throws.
