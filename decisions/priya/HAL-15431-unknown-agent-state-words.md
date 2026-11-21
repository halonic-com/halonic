# Decision: a missing agent or step in the words Studio's step card uses

- Requirements: `workflow.unknown-name-hints`, `workflows.configuration.problem-lines`, `workflows.page.step-problems`
- Task: HAL-15431, from Priya's words check C576 (HAL-15424, rows 16 and 17), for PR #4521 (HAL-15140)
- Approval: Liam's review of this pull request on HAL-15431. A team decision on wording with no board card (HAL-2282 rule).
- Kind: user-visible

## What changes

- A step's agent that its hub doesn't have: `"first" uses the agent "nobody-here", which its hub
  doesn't have`, and for a branch `Branch "x" of "first" uses the agent "nobody-here", which its
  hub doesn't have`. It was `uses unknown agent "nobody-here"`. The other-hub hint
  (`. nobody-here is in the hub support; a workflow can only use its own hub's agents.`) and the
  "Did you mean" guess still follow it.
- A transition to a state the workflow doesn't have: `"first" goes to the step "nope", which this
  workflow doesn't have`, then the "Did you mean" guess. It was `goes to unknown state "nope"`.
- The change is in the core (`packages/core/workflow/src/state-checks.ts`), so `halonic validate`
  and Studio's step card tooltip and problem rows say the same.

## Why

Studio's step card says "✕ Uses a missing agent" and "Goes to a missing step", and its tooltip
shows the core's message, so "unknown agent" put two names for one problem side by side. A plain
"missing" would be wrong when the agent is in another hub, so the words say what holds in both
cases. On screen a state is a step.

## Tests

No test was weakened or skipped. Every test that quoted the old words now quotes the new ones,
with the same assertions. The parity cases `workflow/unknown-agent`, `workflow/unknown-branch-agent`
and `workflow/unknown-target` still give the old loader's issues, severities and place; their
messages are now checked against the new words in `packages/core/workspace/src/checks/workflows.test.ts`,
and the new allowed difference `missing-agent-and-step-words` records the change for the parity
compare.

## Covers

- workflow.unknown-name-hints
- workflows.configuration.problem-lines
- workflows.page.step-problems
- packages/core/workspace/src/checks/workflows.test.ts
- packages/testing/parity/allowed-differences.json
- packages/testing/parity/src/allowed-differences.test.ts
