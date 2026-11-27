# Decision: the workspace template file, template.yaml

- Task: HAL-19432
- Approval: the board chose the template design on HAL-19432 (step 1 only: its own file `template.yaml`, no `acme` fallback), after Liam's review of the `template-design` document. Liam approved this pull request on HAL-19432.
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:qUv639N9sgVEAT+Ngf/ixBKKa3z+xnTHhyAW9KO627kpp7Q9n5Luh+MyHhnIR7qhX+gtNqrTB/S3zormpzG4Dw==

## What changes

`core/format` gains the `workspaceTemplate` kind, the optional `template.yaml` at a workspace's root, with its JSON Schema `packages/core/format/spec/workspace-template.schema.json`. The Acme example now carries one, so two golden files grow by that file:

- `apps/cli/src/commands/init/golden/example.txt` lists `template.yaml` among the files `halonic init --example acme` copies.
- `apps/cli/src/commands/schema/golden/schema-output.json` lists the new kind in `halonic schema`'s output.

No existing line changed meaning, and no test was weakened or skipped.

## Why

The board wants the sample described in files that people can later use to share their own workspaces. A new kind beside `workspace` and `hub` keeps the run formats unchanged, and the golden files only record that the new file exists.

## Covers

- apps/cli/src/commands/init/golden/example.txt
- apps/cli/src/commands/schema/golden/schema-output.json
- packages/core/format/spec/workspace-template.schema.json
