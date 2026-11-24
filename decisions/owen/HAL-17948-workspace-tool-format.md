# Decision: register the workspace tool as a file kind

- Approval: the task HAL-17948 asks for this file kind (plan HAL-17450 rev 5, accepted by the board on 24 Nov); a security PR, so Liam signs this note in review
- Kind: user-visible

The file kind registry gets one new kind, `tool` (`library/tools/<id>.tool.yaml` at the workspace root), so the loader, `halonic validate` and the plugin builder read workspace tool definitions like any other workspace file (plan HAL-17450 rev 5, step 1a). The registry requirement listed its kinds by count, so it now names `tool` too. Nothing is removed: every kind it listed before stays, in the same order. `halonic schema` writes one more file, `tool.schema.json`, so its golden output says 17 schemas and lists it. The two new spec files are the JSON Schemas of the tool file and of the snapshot.

## Covers

- format.kind-registry
- apps/cli/src/commands/schema/golden/schema-output.json
- packages/core/format/spec/tool.schema.json
- packages/core/format/spec/workspace-snapshot.schema.json
