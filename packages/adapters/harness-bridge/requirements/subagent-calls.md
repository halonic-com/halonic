# harness-bridge.subagent-calls

- Status: active
- Since: unreleased
- Source: HAL-17263 (token metric 7 on HAL-16892, field agreed with phase 1e on HAL-17254)

When a program's model request carries a header that only its sub-agents' calls carry, `x-claude-code-agent-id` from Claude Code or `x-openai-subagent` from Codex, the Node bridge shall record that call's `llm.request` and `llm.response` with `subagent: "subagent"`. The programs don't send the sub-agent's type, and the bridge never records those headers' values. A request without either header is recorded without `subagent`, as before.

## Examples

- Given a request to the Anthropic route with an `x-claude-code-agent-id` header,
  when its reply has ended,
  then both `llm.request` and `llm.response` say `subagent: "subagent"`.
- Given a request to the OpenAI route with an `x-openai-subagent` header,
  when its reply has ended,
  then both `llm.request` and `llm.response` say `subagent: "subagent"`.
- Given a request with neither header,
  when its reply has ended,
  then neither event has `subagent`.
