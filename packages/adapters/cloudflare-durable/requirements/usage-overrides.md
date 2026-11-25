# cloudflare-durable.usage-overrides

- Status: active
- Since: unreleased
- Source: HAL-14158 (selling layer S3-6); Cloud's `limits.customer` document (`control-plane.limits-documents`); the plan on HAL-14158 as approved

While a kept limits document has an override of a unit (at most one per unit: a whole amount, and an end `until` in ms since 1970 or no end) whose end is in the future or absent, the usage account shall use its amount in the place of the pool's limit of that unit, in every check, reservation, threshold and summary. Once the account's own clock reaches the end, it shall use the plan's limit again, without waiting for a newer document. An override of a unit the plan doesn't limit shall neither add nor lift a limit. The account shall refuse a document with an override whose unit, amount or end isn't valid, or with two overrides of one unit.

The usage account shall keep a document only when its status is `active`, `stopped` or `none`, and refuse any other. While the kept document's status is `none` (the customer has no plan), the account shall refuse every check, reservation and run start with `plan.none`, as it does while it knows no limits; `stopped` keeps refusing with `plan.inactive`.

When a document lists the units whose limit a bigger plan raises, a refusal at one of the pool's limits shall say whether its unit is one of them (`canUpgrade`); a refusal at a member's share shall not.

Rationale: Cloud stops sending an override that ran out only with the customer's next document, which can be late, so an override that lowered a limit must not stay lifted and one that raised it must not stay raised; a customer without a plan must get the same stop as a customer the deployment knows nothing about; the app words a stop's upgrade offer without asking Cloud.

## Examples

- Given a cost limit of 1,000 and an override of 200 until 10:00,
  when a step needing 300 is reserved at 09:59,
  then it is refused at the limit 200; at 10:00 the same step is held against the limit 1,000.
- Given an override with no end,
  then it applies whatever the time.
- Given an override of `tokens` and a plan with only a cost limit,
  then tokens stay unlimited.
- Given a document with status `none`,
  when a step is checked,
  then it is refused with `plan.none`.
- Given `cost` among the upgradable units,
  when a step is refused at the cost limit,
  then the refusal has `canUpgrade` true; at a member's cost share it has no `canUpgrade`.
