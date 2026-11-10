# engine.turn-tool-call-tag-as-text

- Status: active
- Since: 0.1.0
- Source: HAL-2284 plan PR 4; the `<tool_call>` tags of the Hermes and Qwen chat templates, which local models served without native tool calls write out as text

When a model answers with no tool call but its whole text is one or more `<tool_call>` tags, each holding a JSON object with the `name` of a tool the turn offered and its `arguments`, the engine shall mark that answer's `llm.response` with `toolCallAsText: true` and shall not run the calls. The last tag may lack its closing `</tool_call>`. An answer with other text around the tags, or with a tag that doesn't hold such an object, shall not be marked.

## Examples

- Given an offered tool `lookup` and the answer `<tool_call>{"name": "lookup", "arguments": {"q": "acme"}}</tool_call>`,
  when the turn runs with a run log,
  then its `llm.response` has `toolCallAsText: true` and `lookup` is never called.
- Given the answer `I'll search. <tool_call>{"name": "lookup", "arguments": {}}</tool_call>`,
  when the turn runs,
  then the `llm.response` has no `toolCallAsText`.
