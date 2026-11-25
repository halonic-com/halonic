# Decision: register `routing.yaml` as a file kind, and carry it into the plugin's snapshot and change list

- Approval: the task HAL-18263 asks for a `routing` place in the workspace loader, `snapshotInputOf` and the plugin builder passing it to `makeSnapshot`, and the release file's change list naming a routing change (plan HAL-17450 rev 5, step 2 and "Safety", accepted by the board on 24 Nov); a security PR, so Liam signs this note in review and Julian reviews it
- Kind: user-visible

The file kind registry gets one new kind, `routing` (`routing.yaml` at the workspace root), after `signal`, read with the snapshot's own `Routing` schema and `checkRouting`, so the loader, `halonic validate` and the plugin builder read it like any other workspace file and refuse it for the same reasons the snapshot does. The registry requirement lists its kinds by name, so it now names `routing` too. Nothing is removed: every kind it listed before stays, in the same order. `halonic schema` writes one more file, `routing.schema.json`, so its golden output says 20 schemas and lists it. Like the snapshot's `routing` part, the file has no `version` key, so the spec-id-version requirement and its test name `routing` next to `skill` and `template` as the kinds whose `$id` takes `SCHEMA_VERSION`. `routing.yaml` joins the files an agent's working folder may not be, because it decides who reviews.

`snapshotInputOf` passes the routing to `makeSnapshot`, so its requirement names it too. The plugin build service and `halonic build paperclip-plugin` pass it as well, and the build refuses a `routing.yaml` that isn't committed, as it does a tool file. The change list gains an optional `routing` list of the entries (`roles.<role>`, `areas.<area>`) whose agent changed, and the release file reads and writes it, refusing anything but those two forms; its requirements say so. Without a routing change the field is left out, so a workspace without `routing.yaml` gets the same snapshot, release file and checksum as before.

## Covers

- format.kind-registry
- format.spec-id-version
- workspace.snapshot-input
- plugin-build.change-list
- plugin-build.release-file
- apps/cli/src/commands/schema/golden/schema-output.json
- packages/core/format/spec/routing.schema.json
