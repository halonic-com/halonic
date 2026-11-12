# Decision: a tool_choice that forces some tool becomes auto when the bridge removed every tool

- Approval: HAL-3791, asked for by Liam in the review of HAL-3229
  (HAL-3657); the package owner (Liam) approves this note in review
- Kind: internal
- Task: HAL-3791

## What changes

`harness-bridge.openai`: a `tool_choice` of `required` becomes `auto` when the bridge removed every
one of the request's tools.

`harness-bridge.anthropic`: a `tool_choice` of type `any` becomes `auto` when the bridge removed
every one of the request's tools, keeping its other fields such as `disable_parallel_tool_use`.

Each requirement gains one example.

## Why

These choices force the model to use some tool, without naming one. When the request's only tools
are the provider's web or MCP tools, the bridge removes them all, and the provider answers 400 to a
forced tool use with no tools. The agent can't fix that, so its turn fails. This is the same
treatment HAL-3229 gave a choice that names a removed tool: `auto` lets the turn go on, and the
model still can't reach the removed tools.

The choice is only changed when the bridge removed tools. A request that came with no tools and a
forced choice goes on unchanged: that mistake is the program's, and the provider's 400 tells it so.

No test was weakened or removed.

## Covers

- harness-bridge.openai
- harness-bridge.anthropic
