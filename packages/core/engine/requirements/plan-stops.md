# engine.plan-stops

- Status: active
- Since: unreleased
- Source: HAL-16241 (split from HAL-13218); the selling layer's design (HAL-12483), sections 4.2, 11 (G7) and 13.6; builds on `engine.budget-stops` and `events.run-failed-cause`

When a meter refuses, its stop shall be a cause of kind `limit_reached` whose code starts with `plan.`, and whose `detail` holds strings only:

- `plan.<unit>`, such as `plan.cost`: `unit`, `used`, `limit`, `currency` (for cost), `resetsAt`, `planId`, `planVersion`, `planName` and `canUpgrade`. A refused reservation also has `phase: "reserve"`, `needed` and `left`.
- `plan.member.<unit>`: a member's share of an organisation's unit, with the same detail and `canUpgrade` always `"false"`.
- `plan.concurrency`: `running`, `limit`, and `cap`, `scope` or `member`, for the cap that was hit.
- `plan.none`: the meter knows no limits for the scope.
- `plan.suspended`: the customer isn't active.
- `plan.member-removed`: the person is no longer a member of the organisation.

A unit shall be one word and not `concurrency`, `none`, `suspended` or `member`. The seller's `budget.run` and `budget.month` and a harness step's `harness.max-steps`, `harness.max-minutes` and `harness.max-cost` shall not be `plan.` stops, so they stay final whatever a customer's plan allows.

## Examples

- Given a cost limit of 5 EUR with 5.2 EUR used, resetting on 1 December, on plan `pro` version 3 with a higher plan published,
  when its stop is made,
  then the code is `plan.cost` and the detail has `used: "5.2"`, `limit: "5"`, `currency: "EUR"`, `planId: "pro"`, `planVersion: "3"` and `canUpgrade: "true"`.
- Given a reservation that needs 2 EUR with 0.5 EUR left,
  when its stop is made,
  then the detail also has `phase: "reserve"`, `needed: "2"` and `left: "0.5"`.
- Given a member over their share of an organisation's cost,
  when the stop is made,
  then the code is `plan.member.cost` and `canUpgrade` is `"false"`.
- Given 3 runs running and a member's cap of 3,
  when the stop is made,
  then the code is `plan.concurrency` with `running: "3"`, `limit: "3"` and `cap: "member"`.
- Given the causes `budget.run`, `budget.month`, `harness.max-steps`, `harness.max-minutes` and `harness.max-cost`,
  when the engine asks whether each is a plan stop,
  then none is.
