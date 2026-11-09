# workspace.definitions

- Status: active
- Since: 0.1.0
- Source: HAL-1524 (HAL-186 implementation plan, step 1c, decision 5: runs keep their definitions)

When `definitionsOf` builds the definitions of a run in a hub, the workspace package shall give, as plain data, the workspace settings, the hub's `hub.yaml`, its default model, the hub's own workflows and agents, every model alias the hub can use resolved, the providers and runtimes, and the hub's own library items with the shared ones its `uses` allows, and shall refuse a hub the workspace doesn't have. `definitionsVersion` shall be the lowercase hex SHA-256, taken through the `Digest` port, of the definitions' canonical JSON (`std.canonical-json`), which is the hash the blob store gives the same bytes.

## Examples

- Given hub `billing` with workflow `invoice` and agent `clerk`, and a workflow at the root, when its definitions are built, then they hold `invoice` and `clerk` but not the root's workflow.
- Given shared skills `notes` and `search`, and hub `billing` whose `uses.skills` lists only `notes`, when its definitions are built, then its skills are `notes` and the hub's own.
- Given a hub without `defaults.model`, when its definitions are built, then its default model is the workspace's.
- Given the same files listed in another order, when the version is computed, then it is the same; when an agent's instructions change, it is another.
- Given the version and the canonical JSON of the definitions, when the JSON's SHA-256 is taken on its own, then it equals the version.
- Given hub `nowhere`, which no file is in, when its definitions are built, then that is refused with a `RangeError`.
