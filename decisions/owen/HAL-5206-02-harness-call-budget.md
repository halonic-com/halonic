# Decision: a harness run keeps to the budget call by call

- Requirements: `engine.budget-stops`
- Task: HAL-5206
- Approval: HAL-5206, the CTO's review of this pull request
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:vcLm9431kNWImDYWzU/rmh+H99LxYgrdiB/JsnaQMx45uZbDIM9hApWHnjPTbW7I/xV2N+Yn6283WBjRxCEUAA==

## What changes

`engine.budget-stops` said where the kernel checks the budget: when a step decides on a model call
or a harness run. It now also says how often a harness run checks it: before each model call its
bridge passes on. At or over a limit, the bridge refuses that call with 429 `limit_reached` and
sends nothing to the provider, the harness run is stopped, and the run fails in that state with the
reason `budget`. A new example shows it. Nothing the requirement said before changes; the check at
the step stays as it was.

## Why

A harness run is one step, but it can last long and make many model calls through the bridge. One
check at its start can't keep it to the budget. The bridge already records each call's cost before
the next one goes out, so the spend the check reads counts every call before it.

## Tests

No test was weakened. The new behaviour has its own tests in
`packages/core/engine/src/run/local-runs-harness-budget.test.ts`,
`packages/core/engine/src/harness/run-harness-call.test.ts` and
`packages/adapters/harness-bridge/src/spend.test.ts`.

## Covers

- `engine.budget-stops`
