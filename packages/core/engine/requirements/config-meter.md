# engine.config-meter

- Status: active
- Since: unreleased
- Source: HAL-13218; the selling layer's design (HAL-12483), sections 1, 4.2, 4.3 and 13.6; builds on `engine.meter-port`, `engine.plan-stops` and `format.deployments-users`

`ConfigMeter` shall be a `Meter` that holds each principal to the `stop` limits of a deployment's `users.config`, per UTC day or month, and shall keep its counts in `Coordination`, so every instance of a deployment counts the same. A `notify` limit shall refuse nothing.

- In a personal scope (`u/…`), the limits shall be `users.config.limits`.
- In an organisation's scope (`o/<id>`), the limits shall be the organisation's pool and the member's own share, checked share first. A member past their share shall be refused with `plan.member.<unit>` and `canUpgrade: "false"` while the pool has room. An `actor` the organisation doesn't list shall be refused with `plan.member-removed`, and a scope that names no organisation in the file, or that is neither `u/` nor `o/`, with `plan.none`.
- `check` shall refuse once a unit's use and what steps hold back reach its limit. Only a run start shall count against `runs`, and before it, the member's `concurrency` and then the organisation's shall refuse with `plan.concurrency`, naming the cap that was hit, when as many runs are going as the cap allows.
- `reserve` shall hold back a step's maximum in cost, minutes and model calls, checking the pool and the member's share in the same change, and refuse with `phase: "reserve"`, `needed` and `left` when that much isn't left. A unit the step sets no maximum for shall hold back nothing, and refuse once it is used up. `settle` shall let go of the step's hold and count its harness time. A hold never settled shall lapse after a day.
- `record` shall count a model call as one step, its input and output tokens and its cost (0 when a subscription paid), count nothing for an answer from the cache, and count a run's end as one run.
- A `stop` limit per `run` or per `step` shall make the meter refuse to be created, naming the limit, since the meter is asked by principal and couldn't keep to it.

Rationale: a self-hoster can cap a team without Halonic Cloud (design, section 1). Holding back and settling in one atomic change keeps two parallel steps from passing a check together and going past a limit (4.3). An organisation's members share one pool, and a member's share can't be raised by the member, so their stop can't offer an upgrade (13.6). A scope or person the file doesn't know is refused, since no limits known must never mean no limit.

## Examples

- Given a personal limit of 5 cost per month with 5 used,
  when a model call is checked,
  then it is refused with `plan.cost`, `used: "5"`, `limit: "5"` and `resetsAt` the start of next month.
- Given that limit with 5 used last month,
  when a model call is checked this month,
  then it is allowed.
- Given a `notify` limit of 1 cost per month with 3 used,
  when a model call is checked,
  then it is allowed.
- Given a limit of 2 runs per day with 2 runs ended today,
  when a run start and a model call are checked,
  then the start is refused with `plan.runs` and the model call is allowed.
- Given an organisation with a pool of 100 cost per month, 40 used, and a member's share of 10 with 10 used,
  when that member's model call is checked,
  then it is refused with `plan.member.cost` and `canUpgrade: "false"`, and another member's is allowed.
- Given an organisation that doesn't list the actor,
  when anything is checked or reserved,
  then it is refused with `plan.member-removed`; given a scope `o/` of an organisation the file doesn't have, with `plan.none`.
- Given a member's `concurrency: 1` and an organisation's `concurrency: 3`,
  when the member starts a run with 1 of theirs going, or anyone starts one with 3 going,
  then it is refused with `plan.concurrency` and `cap: "member"`, or `cap: "scope"`.
- Given a limit of 10 cost per month with 7 used,
  when a step reserves 2 and then another reserves 2,
  then the first is held and the second is refused with `phase: "reserve"`, `needed: "2"` and `left: "1"`.
- Given a held step,
  when it is settled with 90,000 ms of harness time,
  then its hold is gone and 1.5 harness minutes are used.
- Given a limit on cost per run,
  when the meter is created,
  then it throws, naming that limit.
