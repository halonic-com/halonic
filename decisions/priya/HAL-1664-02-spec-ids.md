# Decision: each format spec file gets an `$id` that names its file format version

- Requirements: `format.spec-id-version` (`packages/core/format/requirements/spec-id-version.md`), `check.spec-snapshot` (`tooling/check/requirements/spec-snapshot.md`)
- Task: HAL-1664, pull request 2 of 3 (Docker point 5: one spec file per public API)
- Approval: [HAL-1664](/HAL/issues/HAL-1664#comment-56dbba43-8494-46f4-839a-864c291026e3), the CTO's approval of the build plan (points 2 and 4), and [the `skill` fallback](/HAL/issues/HAL-1664#comment-24a1fd3a-94d4-44b3-b884-62ede081f055)
- Kind: internal

## What changes

`jsonSchemaOf` adds an `$id` right after `$schema`, for example
`https://halonic.com/spec/format/workflow/v1.schema.json`, so each of the 15 spec files gains one
line. Nothing else in them changes. The address only names the schema; nothing is hosted there.

## Why

The `v<N>` in the `$id` lets editors and outside tools refer to one version of a file kind's API.
A new test keeps it equal to the kind's `version` const, and for `skill`, which has no `version`
key, to the format's `SCHEMA_VERSION`. `pnpm version:sync` freezes a spec under
`spec/released/<version>/` only when a release changes it.

## Tests

No test was weakened. The spec files are compared with the code exactly as before; the new tests
are additions.

## Covers

- `format.spec-id-version`
- `check.spec-snapshot`
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
