# harness-claude-code.mcp-tools-listed

- Status: active
- Since: unreleased
- Source: HAL-16737 (plan section 0), Liam's OK on HAL-16748

The Claude Code harness shall set `ENABLE_TOOL_SEARCH` to `false`, so Claude Code lists the tools of the MCP servers its settings name (the bridge's integrations among them) directly in every model request, instead of hiding them behind its `ToolSearch` tool. A model that never searches, as cheaper models often don't, would otherwise never see them. The variable adds no tool and no permission: it only changes whether the tools the run already has are shown to the model.

## Examples

- Given any task,
  when the engine opens the sandbox with the harness's environment,
  then `ENABLE_TOOL_SEARCH` is `false`.
- Given a task for `glm-5.3`, for every call,
  when the engine opens the sandbox,
  then `ENABLE_TOOL_SEARCH` is still `false`.
