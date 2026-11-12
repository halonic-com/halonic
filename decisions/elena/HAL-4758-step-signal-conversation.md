# Decision: a step sends its signal and keeps its conversation turns

- Requirements: `engine.step-signal` (new), `engine.task-conversation` (new)
- Task: HAL-4758
- Approval: [HAL-4758](/HAL/issues/HAL-4758), the CTO's review of this pull request
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:XqI2rBARJz6KjPXCJLYSACKz3Fbn/OmPq2aFTFpk1zwIBQWw7qYO9srMkavIjywI8E1JAho8RC8pJj6pKsiFDg==

## What changes

A task, parallel, foreach or workflow state with `signal` now logs `signal.sent` right after the
events that write its output, its data rendered from the context with that output in it
(`engine.step-signal`). A task state with `conversation` adds its prompt and answer as two turns
to the list it keeps under that context key (`engine.task-conversation`). The kept turns aren't
given to the agent's next call yet.

The parity gap `step-signal-and-conversation-ignored` is removed from
`packages/testing/parity/known-gaps.json`.

## Why

The old runner (784f78d) did both, and the base fixture's recorded run log has the `signal.sent`
and the `chat` turns. Without them, the parity compare of
`billing/invoice/an approved invoice is paid and announced` differed.

## Tests

No test was weakened. The test "accepts the package's own file" of `parity.known-gaps-checked`
makes one `expect` per gap in `known-gaps.json`, so removing this gap takes its count from 18 to
17. That test and its checks are unchanged; the parity compare now checks the invoice test
exactly instead. The new behaviour has its own tests in
`packages/core/engine/src/kernel/step-signal.test.ts` and
`packages/core/engine/src/states/task/conversation.test.ts`.

## Covers

- parity.known-gaps-checked
