# runtime.usage-meter

- Status: active
- Since: unreleased
- Source: HAL-18183 (PR 2 of HAL-18024, plan approved on HAL-18104); selling layer design, section 3.3

The Worker shall meter a top-level run through a `Meter` over the run's scope's usage object, which passes the Meter contract suite (`contracts.meter`). A child run's reservations and model calls shall be held and recorded under its top-level run. A check for a run start shall count the running runs against the caps and take no slot. A settle shall charge a step its harness time and zero of every other unit, since its model calls were recorded as they answered, so a settle that comes after the reservation ran out and was charged in full leaves each call's cost counted once. A run's end shall be counted once per run, however often it is recorded, and shall free the run's slot.

The meter shall answer the object's refusals as the plan's stops: `plan.inactive` as `plan.suspended`, `plan.member.inactive` as `plan.member-removed`, a member's run cap as `plan.concurrency` with cap `member`, and harness time in minutes and cost in the plan's currency. The object's own load limits shall keep their codes, `usage.rate`, `usage.member.rate` and `usage.outbox-full`, as `limit_reached` causes that are not `plan.` stops, so no plan upgrade lifts them. Until Cloud sends a plan's name, every stop shall say it can't be upgraded.

Rationale: the engine counts one run through one meter, while the usage object keeps each scope's use for Cloud to bill. A step's maximum held twice, or a call's cost counted twice after a late settle, would refuse a customer's work that their plan allows.

## Examples

- Given a pool of 10 in cost, a step that holds 6 and a model call that cost 4,
  when the step's reservation runs out and its settle comes late,
  then 6 is left.
- Given a child run of `run_top`,
  when its step reserves and its model call is recorded,
  then both are under `run_top`.
- Given a run's end recorded twice and a pool of 2 runs,
  when a run start is checked,
  then it is allowed.
- Given an actor past 120 calls in a minute in an organisation,
  when they check,
  then the cause is `usage.member.rate`, not a `plan.` code.
