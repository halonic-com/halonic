# Decision: more reasons why a run failed

- Requirements: `events.run-failed-reason` (`packages/core/events/requirements/run-failed-reason.md`),
  `events.run-log-contract` (`packages/core/events/requirements/run-log-contract.md`)
- Task: HAL-1728, from the failure-path decisions on HAL-1668 and Liam's decision on HAL-1967
- Approval: the task asks for these reasons; the maintainer approves this note in review

## What changes

`RunFailureReason` gains `model-unreachable`, `model-out-of-memory`, `disk-full`, `interrupted`,
`sandbox-start-failed` and `harness-start-failed`, each with its own requirement. The last example
of `events.run-failed-reason` said the list is "exactly `budget`, `cancelled`, `model-missing`,
`model-no-tools` and `error`" (the last two came with HAL-1880). It now says those five plus the
reasons added since, each with its own requirement. The main sentence names the new requirements.
Nothing it promised before is taken away: the five reasons mean what they meant, and logs without
`reason` read as before.

`events.run-log-contract`: its first example lists the events added since the reference, each
with its own requirement. It now also names `connector.started` (`events.connector-started`), as
HAL-1707 did for `sandbox.opened`. Its third example listed "the four fields that come with the
engine". It now lists five: the optional `run.failed.host` joins them, with its own requirement
(`events.run-failed-model-unreachable`). No reference field changes.

## Tests

No test was weakened. The `events.run-failed-reason` type test moves from `run-event.test.ts` to
`run-failure.test.ts`, next to the tests of the new reasons, and still checks the exact list, now
with all eleven reasons. It also gains a check that a `run.failed` event without `reason` is still
valid.
