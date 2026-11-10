# memory.tool-approval-store

- Status: draft
- Since: 0.1.0
- Source: HAL-2210 step 3; `ToolApprovalStore` port v1. It becomes active with `ports.listed-tool-approval`.

The memory tool approval store shall keep each approval as JSON text, so that every read gives a fresh copy, and keep its keys in nested maps by location, source and name. For tests, `damage(key)` shall make that key's approval unreadable, after which `get` throws an error naming the tool, its source and its workspace, and `list` for its source throws. `damage` on a key without an approval shall throw and create nothing.

## Examples

- Given an approval for `lookup` of `notes` in `/workspaces/acme`,
  when `damage` is called for it and it is read,
  then it throws `The approval for tool "lookup" of "notes" in "/workspaces/acme" can't be read.`
- Given an empty memory tool approval store,
  when `damage` is called for `lookup`,
  then it throws naming `lookup`, and `list` still gives `[]`.
