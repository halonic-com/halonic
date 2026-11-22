# Decision: the run log records "Allow this address?" before it is asked, and the step shows the wait

- Approval: Liam's comment of 22 Nov on HAL-15213 (Paperclip task): the `key-origin.asked` PR for "Waiting for your answer", reviewed by him because it adds a run-log event
- Kind: internal

## What changes

- `events.key-origin-asked` (new): a `key-origin.asked` event with the provider, the key's name and the address, never the key's value. It is written before the question is shown.
- `cli.key-origin-ask` (changed): the host now writes `key-origin.asked` to the run's log before it asks, then the answer as before. So a wait that ends without an answer (stopped, timed out, can't be asked) leaves the question in the log and no answer, where before it left nothing. The tests for those cases now expect exactly that one event, and the tests for Allow and Don't allow expect the question before the answer. Nothing else in the requirement changed: still one question per call, the same saved address, the same refusal.
- `runs.run-view.key-origin-waiting` (new): while a running run's log ends with `key-origin.asked`, the step shows "Waiting for your answer" with the "needs you" mark, at once.

Nothing was removed or weakened. `sandbox.blocked` moved from the event union in `run-event.ts` into `sandbox-blocked.ts` as `SandboxBlockedEvent`, with the same fields, so the union file keeps its size headroom.

## Why

The UX checklist on HAL-11873 ("Prompt open") wants the run to show "Waiting for your answer" on the step. The question lives in the host's memory only, so the run page, which reads the run's log, couldn't see it. A log line is how the page learns of it, and it also tells someone reading the log later that a question was open.

## Covers

- packages/adapters/workspace-models/src/key-origin-ask.test.ts
- packages/core/events/src/key-origin-asked.test.ts
- packages/core/events/src/run-event.test.ts
- packages/studio/features/runs/src/run-view/key-origin-wait.test.ts
