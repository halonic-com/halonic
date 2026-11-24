# harness-claude-code.mcp-tools-listed

- Status: active
- Since: unreleased
- Source: HAL-16737 (plan section 0), Liam's OK on HAL-16748; HAL-17253 (tool search on for Claude's own models)

The Claude Code harness shall set `ENABLE_TOOL_SEARCH` to `true` for Claude's own models, so Claude Code loads the MCP servers' tools and its rarely used built-in tools on demand through its `ToolSearch` tool and the first call stays under the starting-context target (`harness-claude-code.starting-context`). When the task's model is for every call (`modelForEveryCall`), it shall set `ENABLE_TOOL_SEARCH` to `false`, so Claude Code lists the tools of the MCP servers its settings name (the bridge's integrations among them) directly in every model request: a compatible provider's cheaper model often never searches, and would otherwise never see them. The variable adds no tool and no permission: it only changes whether the tools the run already has are shown to the model up front.

## Examples

- Given a task for `claude-sonnet-5-5`, or a task with no model,
  when the engine opens the sandbox with the harness's environment,
  then `ENABLE_TOOL_SEARCH` is `true`.
- Given a task for `glm-5.3`, for every call,
  when the engine opens the sandbox,
  then `ENABLE_TOOL_SEARCH` is `false`.
