# Decision: a meter's plan stop gets its own facts in the app

- Task: HAL-14163
- Approval: /HAL/issues/HAL-14163 (Elena's plan, approved by Liam on the task, 26 Nov; takes point 1 of HAL-16574)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:89Gm9APO1xtloyE7o57FJ4deayUNyckLGXJlFHVJyIbYFlkNv1dzUndJ9FKNyKsJeGxGkl3h0cXke82IALI7BA==

## What changes

- New requirement `app.run-plan-stop`. The app reads a meter's `plan.` stop from its code and
  detail into facts a screen words: a unit's stop (percent used, the reset, the plan's name,
  whether a bigger plan helps, a refused reservation's percent needed and left), too many runs at
  once, no plan, an inactive customer and a removed member. It also reads from a run's summary
  whether the run waits at a unit's limit, stopped for good because nobody continued it, or
  stopped without waiting. Studio's limit messages (HAL-14163's next pull requests) word these
  facts.
- `app.run-failure-plan-stop` gains one sentence: the `error` facts of a plan stop also hold the
  stop's own facts as `plan` when they read. Its examples say so. Nothing it gave before is gone:
  the message and the known cause stay, so the CLI prints the same lines.
- Its test changes to match: the `plan.cost` case and the `plan.none`, `plan.suspended` and
  `plan.member-removed` cases now also expect `plan`. `plan.member.cost` and `plan.concurrency`,
  which the test gives no detail, still expect none. It checks more than before, not less.

## Decided on purpose

- **The cost unit's facts hold percentages only.** Model cost is the seller's cost, and a
  customer never reads it as money (flows, section 0), so the amounts and the currency never
  reach a screen through these facts. Other units, such as agent time, keep their amounts.
- **"Stopped for good" is read from the summary's `nextTimer`.** A `continue` clears it, so a
  run that failed at a unit's stop at or after its wait's end failed because the wait ended.
  This needs no new event field.
- **Still an `error` with `plan`, not a new reason.** A new reason would change every client's
  catalogue at once; the CLI lines stay with HAL-16574.

## Covers

- app.run-failure-plan-stop
- packages/core/app/src/run-failure-plan-stop.test.ts
