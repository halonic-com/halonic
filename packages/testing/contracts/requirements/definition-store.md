# contracts.definition-store

- Status: active
- Since: 0.1.0
- Source: HAL-114; plan 4.3; `DefinitionStore` port v1; old `784f78d:packages/testing/port-contracts` `definitionStoreContract`

Where an adapter implements `DefinitionStore`, it shall pass `contracts.definition-source`, create or replace a file on `write`, delete it on `remove` (a missing file is not an error), and change its version when the content changes. When `write` or `remove` gets an unsafe path, the store shall reject with a `RangeError` and change nothing.

## Examples

- Given an empty store,
  when `workspace.yaml`, `hubs/a/hub.yaml` and `hubs/a/agents/x.agent.yaml` are written,
  then `list()` gives all three sorted, and after `remove("workspace.yaml")` reading it gives `null`.
- Given a store with `a.yaml` = `1`,
  when `a.yaml` is written as `2`,
  then the version differs from before.
- Given a store,
  when `write("../x.yaml", …)` is called,
  then it rejects with a `RangeError` and the version is unchanged.
