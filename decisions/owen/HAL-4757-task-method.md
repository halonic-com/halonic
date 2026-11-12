# Decision: a method prompt names its fields in name order

- Approval: [HAL-4757](/HAL/issues/HAL-4757) asks for this change; Liam approves it in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:6GlNIaehDryt0ZWHpE1+0m9VMjVGkuFfgVxDElyQ8ZEqBpdsmvJUn7HlNQC8yyl4aV1KH1Nj8VQg0ThOvaKRBA==

## What changes

A step with `method` now sends the method's prompt and uses the method's model, steps, tools and
answer fields (new requirements `workflow.method-prompt`, `engine.task-method` and
`engine.foreach-item-method`), so the known gap `task-method-ignored` is removed. One difference
from 784f78d remains: the line `Answer with JSON with these fields: ...` names the fields in name
order (amount, note, vendor), where the old runner used the agent file's order (vendor, amount,
note). It is added to `allowed-differences.json` as `method-fields-by-name`, status `proposed`,
with a run rule of the same name. The rule sorts that one line in the old log's `agent.started`
prompts and `knowledge.searched` queries and changes nothing else. No test, requirement or golden
file is removed or weakened.

## Why

Runs keep their definitions as canonical JSON (HAL-186 decision 5), which sorts keys, so a run
can't read the file's order back. This is the same cause, and the same answer, as
`parallel-branch-name-order` (Liam, HAL-3703). Keeping the file's order would mean changing how
runs keep their definitions, for a line that only tells the model which fields to answer with; the
answer is read as JSON by name, so no result changes.

The tests of `parity.known-gaps-checked` make one `expect` call fewer: one of them checks each gap
in `known-gaps.json`, and this change removes the gap `task-method-ignored`, as HAL-4757 asks.

## Covers

- packages/testing/parity/allowed-differences.json
- parity.known-gaps-checked
