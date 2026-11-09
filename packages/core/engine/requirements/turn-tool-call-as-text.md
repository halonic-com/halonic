# engine.turn-tool-call-as-text

- Status: active
- Since: 0.1.0
- Source: HAL-1061 "Providers and fallback" (local-model test plan question 4); plan approved with changes on HAL-1880

When a model answers with no tool call but its whole text, alone or in one code fence, is a JSON object with the `name` of a tool the turn offered and its `arguments`, the engine shall mark that answer's `llm.response` with `toolCallAsText: true` and shall not run the call. An answer that names a tool the turn didn't offer, isn't such an object, or made a real tool call shall not be marked.

## Examples

- Given an offered tool `lookup` and the answer `{"name": "lookup", "arguments": {"q": "acme"}}` in a `json` code fence,
  when the turn runs with a run log,
  then its `llm.response` has `toolCallAsText: true`, the turn ends with that text, and `lookup` is never called.
- Given the same answer naming `delete`, which wasn't offered,
  when the turn runs,
  then the `llm.response` has no `toolCallAsText`.
