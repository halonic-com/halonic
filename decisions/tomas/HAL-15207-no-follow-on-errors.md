# Decision: no follow-on error on a routine whose hub or root agent failed

- Approval: Liam approves this change on HAL-15207 (https://paperclip.halonic.com/HAL/issues/HAL-15207), from his review of #4423 on HAL-14277 (point 2), which kept it out of that pull request because it changes what the old app recorded. A team decision with no board card (HAL-2282 rule).
- Kind: user-visible

## What changes

- **A root routine whose hub failed.** When a root routine's `run.hub` names a hub whose
  `hub.yaml` failed its own checks (a wrong type, a missing or unknown key, or an id that differs
  from its folder), `validate` no longer adds `Routine "<id>": unknown hub "billing"`. The hub's
  own error is the only one. What the routine runs and the mailbox it watches aren't checked,
  since that hub's files were left out, as they already weren't for the hub's own routines. Its
  trigger is still checked: a bad cron still gives its error. A `run.hub` naming a hub with no
  `hub.yaml` at all still gives `unknown hub`, so the parity case `routine/unknown-hub` keeps it.
- **A root whose only agent failed.** A root routine without `run.hub` no longer gets
  `workspace-level routines need run.hub (or agents/ and workflows/ at the root)` when the root
  has an agent or workflow file that failed its own checks: that file's error is the only one. A
  root with no agent or workflow files still needs `run.hub`, so the parity case `routine/no-hub`
  keeps its error.
- One parity difference, `routine-in-failed-hub-not-unknown`, records the ten routine files that
  change: `hourly-check` and `on-paid` in each of `hub/bad-id-in-uses`, `hub/deep-nesting`,
  `hub/missing-required`, `hub/unknown-key` and `hub/wrong-type`. No other fixture changes,
  including the base's `cli.json`, whose `unknown hub` is for a hub that doesn't exist.

The requirement `workspace.routines` says this, with an example for each case. The two tests that
checked for `unknown hub` on those routines (`routines.test.ts` for `hub/wrong-type`, and
`references.test.ts` for four hub cases, now five with `hub/bad-id-in-uses`) now check that the
routines have no error and that only `hub.yaml` has one. A test is added for each case, with its
code, line and message. No test was weakened or skipped.

## Why

The hub and the agent are there, and their own errors say what to fix. A second error on the
routine sends the user to the wrong file, the same reason a failed agent is no longer "unknown"
in a workflow (HAL-14277).

## Covers

- workspace.routines
- workspace.references
- packages/testing/parity/allowed-differences.json
