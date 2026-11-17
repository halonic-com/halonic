# Decision: the method fields order is an allowed parity difference

- Approval: HAL-7123 asks for this change, as planned in the note for HAL-4757; Liam signs it
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:mF/WEQcrxia7TEusBeOBGlkeDBagXF3laNNMvK+mLizqoONwSxwmRTiyAqiQsmNzHpZL/jOiCl5zCB40V4C0Dg==
- Task: HAL-7123

## What changes

The known gap `method-fields-in-file-order` becomes the allowed difference `method-fields-by-name` in
`packages/testing/parity/allowed-differences.json`, for the requirement `engine.task-method`. A run rule of the same
name sorts the fields of the old runner's line `Answer with JSON with these fields: ...` by name, in `agent.started`
and `knowledge.searched`, so the compare sees the old prompt in the order the engine writes it. The list of
requirements the allowed-differences test checks gains `engine.task-method`. No test, requirement or golden file is
removed or weakened.

## Why

Runs keep their definitions as canonical JSON (HAL-186 decision 5), which sorts keys, so a run can't read the agent
file's order back. It is the same cause, and the same answer, as `parallel-branch-name-order`. The line only tells the
model which fields to answer with, and the answer is read as JSON by name, so no result changes.

HAL-4757 could only record this as a known gap, because `allowed-differences.json` is one of the guard's own paths and
needs a `user-visible` note. The CTO's key now approves that kind (HAL-8507).

## Covers

- packages/testing/parity/allowed-differences.json
- parity.allowed-differences-checked
- parity.known-gaps-checked
- parity.compare-run-logs
