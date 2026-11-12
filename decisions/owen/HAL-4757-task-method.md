# Decision: a method prompt names its fields in name order, a known gap for now

- Approval: [HAL-4757](/HAL/issues/HAL-4757) asks for this change; Liam approves it in review
- Kind: internal

## What changes

A step with `method` now sends the method's prompt and uses the method's model, steps, tools and
answer fields (new requirements `workflow.method-prompt`, `engine.task-method` and
`engine.foreach-item-method`), so the known gap `task-method-ignored` is removed. One difference
from 784f78d remains: the line `Answer with JSON with these fields: ...` names the fields in name
order (amount, note, vendor), where the old runner used the agent file's order (vendor, amount,
note). It is the new known gap `method-fields-in-file-order`, for the same four tests, with
[HAL-7123](/HAL/issues/HAL-7123) as its task. No test, requirement or golden file is removed or
weakened.

## Why

Runs keep their definitions as canonical JSON (HAL-186 decision 5), which sorts keys, so a run
can't read the file's order back. This is the same cause, and the same answer, as
`parallel-branch-name-order` (Liam, HAL-3703). Keeping the file's order would mean changing how
runs keep their definitions, for a line that only tells the model which fields to answer with; the
answer is read as JSON by name, so no result changes.

It is a known gap and not an allowed difference because `allowed-differences.json` is one of the
guard's own paths: changing it needs a `user-visible` note, and no key can sign one until the
board pins a user key (HAL-3434). HAL-7123 waits on HAL-3434 and then moves the gap to
`allowed-differences.json` as `method-fields-by-name`, with the run rule that sorts the old line
(kept on the branch `owen/HAL-4757-method-fields-allowed`).

## Covers

- parity.known-gaps-checked
