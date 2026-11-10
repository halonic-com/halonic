# Decision: a stored OpenAI prompt is refused, and a tool_choice of a removed tool becomes auto

- Approval: [HAL-3229](/HAL/issues/HAL-3229), asked for by Liam in the B4 review ([HAL-3234](/HAL/issues/HAL-3234)); the package owner (Liam) approves this note in review
- Kind: internal
- Task: HAL-3229

## What changes

`harness-bridge.openai` gains two rules:

- A request with a top-level `prompt` that isn't `null` is refused with the kind `denied`, and
  OpenAI isn't called.
- A `tool_choice` whose `type` is a removed type (`web_search*`, `mcp`) becomes `auto`. An
  `allowed_tools` choice loses those tools from its list, and becomes `auto` when none are left.

`harness-bridge.anthropic` changes one rule: a `tool_choice` of type `tool` that names a removed
tool, and no kept tool, becomes `auto`, keeping its other fields such as
`disable_parallel_tool_use`. Before, the request went on and Anthropic's 400 came back unchanged.

Each requirement gains one example.

## Why

A prompt stored in the OpenAI project can bring its own tools, such as web search, which OpenAI
adds on its side. The bridge can't see them, so removing `tools` doesn't cover them (decision 7,
HAL-2076). It refuses rather than dropping `prompt`, because the stored prompt also holds the
instructions: without it the model would answer a different request than the one the program sent.

A forced tool that the bridge removed makes the provider answer 400, so the agent's turn fails
for a reason it can't fix. Setting the choice back to `auto` lets the turn go on with the tools the
agent does have. Refusing instead was the other option; `auto` is kinder to the agent, and the
model still can't reach the removed tool. OpenAI names a forced tool by its `type`, Anthropic by
its `name`, so each route has its own rule. On Anthropic, when the program's own tool has the same
name as a removed server tool, the choice is left alone, because it then forces the kept tool.

No test was weakened or removed.

## Covers

- harness-bridge.openai
- harness-bridge.anthropic
