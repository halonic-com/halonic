# Decision: ready_for_review wakes the agent's task instead of being called again with the check's id

- Task: HAL-18980
- Approval: the board's go for Track B of the token plan (proposal on HAL-18938), given on HAL-18980; Liam approves and signs this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:al8B8kdxGZ3n9OgTPmgzQb8dsi9cDWPSXu1hwCV/xA06GqsYIIEHOSs1yeTevo4enTq77OCknF+nzfBbb0gdAg==

## What changes

`paperclip.ready-for-review` said a `RUNNING` answer gives the check's id, which a later call passes to read that check. It now adds "unless the plugin wakes a task for that check (`paperclip.ready-for-review-wake`)". For a branch named `<agent>/<task>-<words>` whose task the calling agent holds, the plugin keeps the running check in its state and says it wakes that task; a later call for the same check gives the same answer without a request. The new `precheck-wake` job reads the kept checks every minute and posts the answer on the task, waking it once. A branch without such a task keeps the old answer and the old way of reading a check by its id. Nothing else in the requirement changes.

The plugin gets no new capability: it already has `plugin.state.*`, `issues.read`, `issue.comments.create`, `issues.wakeup`, `jobs.schedule` and `events.emit`. The manifest gains one job, `precheck-wake`, every minute, which does nothing while no check is kept.

## Why

Agents called `ready_for_review` again with the check's id while a check ran: 1,746 calls, about 3% of builder points and 5% of builder time (deep dive on HAL-18938, sections 11 and 12). Waking the task with the answer ends that polling.

## Tests

No test was skipped or weakened. `ready-for-review.test.ts` keeps every test and assertion; its fake moved to `ready-for-review.test-helper.ts` so the new `precheck-waits.test.ts` can share it, and the one call that set the service's address passes it as `config`. `worker.test.ts` now also expects the `precheck-wake` job.

## Covers

- paperclip.ready-for-review
