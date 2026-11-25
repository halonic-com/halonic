# Decision: register the workspace signal as a file kind, and add signals to the snapshot

- Approval: the task HAL-17980 asks for signal files and the snapshot's `signals` section (plan HAL-17450 rev 5, step 2, accepted by the board on 24 Nov); a security PR, so Liam signs this note in review
- Kind: user-visible

The file kind registry gets one new kind, `signal` (`library/signals/<id>.signal.yaml` at the workspace root), after `template`, so the loader, `halonic validate` and the plugin builder read signal files like any other workspace file. The registry requirement lists its kinds by name, so it now names `signal` too. Nothing is removed: every kind it listed before stays, in the same order. `halonic schema` writes one more file, `signal.schema.json`, so its golden output says 19 schemas and lists it.

The workspace snapshot gets an optional `signals` list next to `templates`, checked as tool files are. Its requirement said a `signals` key was refused, as an example of an unknown key; that example now uses `secrets`, which is still unknown, and the requirement describes the new list, its refusals and `readSignal`. `snapshotInputOf` passes a workspace's signal files to `makeSnapshot` as it does its templates, so its requirement names them too. A snapshot without signals is written exactly as before, so its text and checksum don't change. The committed JSON Schema of the snapshot gains the list, and the new spec file is the JSON Schema of the signal file.

## Covers

- format.kind-registry
- format.workspace-snapshot
- workspace.snapshot-input
- apps/cli/src/commands/schema/golden/schema-output.json
- packages/core/format/spec/signal.schema.json
- packages/core/format/spec/workspace-snapshot.schema.json
