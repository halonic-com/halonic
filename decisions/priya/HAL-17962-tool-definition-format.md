# Decision: the tool definition joins the kind registry

- Requirement: `format.kind-registry` (`packages/core/format/requirements/kind-registry.md`)
- Task: HAL-17962; the phase 3 plugin plan, rev 5 (HAL-17450)
- Approval: Liam approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:anHxW9ChvuRPKpqmcb4NfTzSme5pYiLjbas2AyJfqnWvYxuOwXzLOwo5g4lZIoBY/NpP6ALSKuT5iA5TZARLBA==

## What changes

`format.kind-registry` listed the 14 workspace kinds and, after them, the two kinds with no place
in the loader's layout: the integration sheet and the plugin manifest. It now lists a third one,
the tool definition (`tool`), last. Its example now names `integration`, `plugin` and `tool`.

The `halonic schema` golden (`apps/cli/src/commands/schema/golden/schema-output.json`) gains
`tool.schema.json`, and the count it prints goes from 16 to 17. No example or test was removed
or weakened; the parity test leaves `tool` out like `integration` and `plugin`, because the old
app had no such file to compare with.

The new kind's JSON Schema golden, `packages/core/format/spec/tool.schema.json`, is added, as
every kind has one. `tooling/check/policy.json` gains `./snapshot` in `@halonicjs/format`'s
`extraExports`: the entry a runtime reads snapshots with, which loads neither the YAML parser nor
the builder (a test checks that).

## Why

The plugin plan (HAL-17450, step 1a) moves tool definitions into the workspace as files. A file
kind gives them the same parsing, positions, key check and JSON Schema as every other workspace
file, and `halonic validate` can use it. The kind has no place yet, so the workspace loader and
Studio's library don't change. Studio's source control maps every kind name to a label and an
icon, so `packages/studio/features/source-control/src/changes-words.ts` and `src/ui/item-icon.tsx`
each gain a `tool` entry ("Tool", the plugins icon); no screen shows it until tools have a place. the plugin builder names the folder it reads tools from, in its own
task.

## Covers

- format.kind-registry
- packages/core/format/src/registry.test.ts
- apps/cli/src/commands/schema/golden/schema-output.json
- packages/core/format/spec/tool.schema.json
- tooling/check/policy.json
- packages/studio/features/source-control/src/changes-words.ts
- packages/studio/features/source-control/src/ui/item-icon.tsx
