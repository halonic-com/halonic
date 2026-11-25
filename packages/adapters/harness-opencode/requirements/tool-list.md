# harness-opencode.tool-list

- Status: active
- Since: unreleased
- Source: HAL-16826 (step 0 results: `opencode_worktree_remove`'s deny rule isn't enforced, so the exact tool list is checked); HAL-18152

The OpenCode harness shall name the exact list of tools the pinned OpenCode version sends the model with Halonic's config and no MCP server. Its tests shall fail when the list recorded from that version differs from it, so a new or ungated tool fails CI.

## Examples

- Given the list recorded from OpenCode 2.3.0,
  when the tests run,
  then it equals the harness's list of 15 tools.
