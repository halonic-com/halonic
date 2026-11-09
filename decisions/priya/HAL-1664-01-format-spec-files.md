# Decision: the format's JSON Schema goldens become spec files in `packages/core/format/spec/`

- Requirements: `format.json-schema-goldens` (`packages/core/format/requirements/json-schema-goldens.md`), `check.guard-golden-files` (`tooling/check/requirements/guard-golden-files.md`)
- Task: HAL-1664, pull request 1 of 3 (Docker point 5: one spec file per public API)
- Approval: [HAL-1664](/HAL/issues/HAL-1664#comment-56dbba43-8494-46f4-839a-864c291026e3), the CTO's approval of the build plan
- Kind: internal

## What changes

The 15 golden JSON Schema files move from `src/kinds/<kind>/golden/` to the package's `spec/` folder,
one file per kind named after the kind's folder. Their content doesn't change. The test that compares
them with the code now goes through one helper, `expectSpecFile`, and writes files on purpose with
`SPEC_WRITE=1` instead of `FORMAT_WRITE_GOLDEN=1`. Its requirement keeps its ID and now names the new
place.

The requirement guard treats `.schema.json` files under a `spec/` folder as golden files, so a changed
spec file still needs a decision note after the move.

## Why

A spec file is the source of truth outsiders read for a public API. One predictable folder per owning
package makes it findable, and it is where the next pull requests freeze a copy per release. Without
the guard change, moving the files out of `golden/` would have dropped the note they need when they
change.

## Tests

No test was weakened. The comparison is the same; one test was added that the helper fails on a
missing or different spec file, and two that the guard treats spec files as golden.

## Covers

- `format.json-schema-goldens`
- `check.guard-golden-files`
- `packages/core/format/spec/agent.schema.json`
- `packages/core/format/spec/collection.schema.json`
- `packages/core/format/spec/connector.schema.json`
- `packages/core/format/spec/deployments.schema.json`
- `packages/core/format/spec/hub.schema.json`
- `packages/core/format/spec/integration.schema.json`
- `packages/core/format/spec/knowledge.schema.json`
- `packages/core/format/spec/models.schema.json`
- `packages/core/format/spec/provider.schema.json`
- `packages/core/format/spec/routine.schema.json`
- `packages/core/format/spec/runtime.schema.json`
- `packages/core/format/spec/skill.schema.json`
- `packages/core/format/spec/workflow-test.schema.json`
- `packages/core/format/spec/workflow.schema.json`
- `packages/core/format/spec/workspace.schema.json`
- `packages/core/format/src/kinds/agent/golden/agent.schema.json`
- `packages/core/format/src/kinds/collection/golden/collection.schema.json`
- `packages/core/format/src/kinds/connector/golden/connector.schema.json`
- `packages/core/format/src/kinds/deployments/golden/deployments.schema.json`
- `packages/core/format/src/kinds/hub/golden/hub.schema.json`
- `packages/core/format/src/kinds/integration/golden/integration.schema.json`
- `packages/core/format/src/kinds/knowledge/golden/knowledge.schema.json`
- `packages/core/format/src/kinds/models/golden/models.schema.json`
- `packages/core/format/src/kinds/provider/golden/provider.schema.json`
- `packages/core/format/src/kinds/routine/golden/routine.schema.json`
- `packages/core/format/src/kinds/runtime/golden/runtime.schema.json`
- `packages/core/format/src/kinds/skill/golden/skill.schema.json`
- `packages/core/format/src/kinds/workflow-test/golden/workflowTest.schema.json`
- `packages/core/format/src/kinds/workflow/golden/workflow.schema.json`
- `packages/core/format/src/kinds/workspace/golden/workspace.schema.json`
