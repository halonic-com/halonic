# Decision: three optional event fields, a list of waiting approvals and the last waiting time

- Approval: [HAL-1515](/HAL/issues/HAL-1515) approves the HAL-186 implementation plan, which lists these changes (step 2); the package owner (Liam) approves this note in review
- Kind: internal
- Task: HAL-1525

## What changes

The run log gains three optional fields, each with its own requirement: `tool.result.outcome`
(`ok`, `error`, `unknown`), `run.failed.reason` (`budget`, `cancelled`, `error`) and
`approval.resolved.by` (`"person"` or `"rule"`). Nothing is renamed or removed. The
`events.run-log-contract` example that said none of the three exists yet now says each is optional
and has its requirement, and the three type tests that pinned their absence now pin them as
optional.

The summary's `approval` (one entry or `null`) becomes `approvals`, a list, because parallel
branches of one run can each wait for an approval (HAL-1257). Each entry also gives `at`, `state`,
`branch` and `item`. An `approval.resolved` removes the entry with its call id instead of clearing
everything. The summary also gains `lastWaitingAt`, the time of the last `run.waiting`.

## Why

The engine (HAL-186 steps 3a, 4b, 4c) writes these fields, and Studio's Inbox needs one item per
waiting approval. Logs written before the change read exactly as before: a new test parses an
old-shape log line by line, checks that nothing is added, and pins its summary. Only the summary's
shape changes, and the summary is worked out from the log, never stored. Its only other user,
`TestExecutor` in `core/app`, is updated in the same pull request.

No test was weakened or removed.

## Covers

- events.run-log-contract
- events.summary-approvals-and-signals
- events.summary-waiting
- events.upgrade-old-run-logs
- packages/core/events/src/run-event.test.ts
- packages/core/events/src/summarize.test.ts
