# Decision: add the runtime export folder format

- Approval: [HAL-6707](/HAL/issues/HAL-6707)
- Kind: internal

Step 1b of the cloud track (HAL-198 build plan, multi-cloud ADR on HAL-35,
rule 3 and 5.6) adds the folder format of `halonic deploy export` and
`import`: a manifest, `halonic-export.json`, and the files it lists, in the
layout `halonic serve` keeps in the profile (`runs/`, `records/`, `blobs/`).
It is a new entry point, `@halonicjs/format/runtime-export`, and nothing
reads or writes an export yet.

As the approval asks, the manifest and each file entry refuse any key they
don't list, and only the three path shapes are allowed, so a secret or
sign-in token has no place in an export. A test runs the secret scanner over
the example export. The manifest carries `formatVersion` (now 1), and a newer
one fails with a message that says to update Halonic.

The new golden JSON Schema `runtime-export.schema.json` is the format
outsiders read. Its `$id` names the format version. Nothing that existed
before changes. The new requirement `format.runtime-export` describes the
rules and their examples.

## Covers

- packages/core/format/spec/runtime-export.schema.json
