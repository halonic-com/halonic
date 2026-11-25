# Decision: a rule step also uses `input`, so the ignored-key hint names it

- Approval: Liam approves the plan rev 1 of HAL-18500 (https://paperclip.halonic.com/HAL/issues/HAL-18500), and signs this note on the pull request's review. A team decision with no board card (HAL-2282 rule).
- Kind: user-visible

## What changes

The workflow format gets the step kind `rule` (`workflow.rule-step`, `engine.rule-state`). A rule
step gives its rule `ctx.input` with the same `input` key as task, workflow and for-each steps. The
`ignored-key` warning lists every step kind that uses a key, so for `input` on a wait step it now
says "Only task, workflow, for-each and rule steps use it" instead of "Only task, workflow and
for-each steps use it". The rule of `workflow.validate-ignored-keys` doesn't change; only its
example's list of kinds and the test's expected text follow it. No test was weakened or skipped.

## Why

The list comes from `STATE_KEYS`, so the check and the engine can't disagree: a new kind that uses
`input` belongs in it.

## Covers

- workflow.validate-ignored-keys
- packages/core/workflow/src/validate-ignored-keys.test.ts
