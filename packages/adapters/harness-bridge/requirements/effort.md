# harness-bridge.effort

- Status: active
- Since: unreleased
- Source: HAL-16735 (D38 on HAL-16520: per-model effort in the bridge, for any program, set in the agent's files; trials where effort low cut a cheap model's tokens by 39 to 55% without losing a passed task)

When the agent's access to a provider names an effort for a model (`efforts`), and the program's `POST /v1/messages` or `POST /v1/responses` names exactly that model, case and all, the Node bridge shall send the provider the request with that effort in place of the program's own: for Messages in `output_config.effort`, for Responses in `reasoning.effort`, keeping the other keys of that object. It shall record the effort as the `effort` of the call's `llm.request`.

It shall change nothing else of the request: never `thinking` (Claude Opus 5.5 and Sonnet 5.5 refuse `thinking: disabled`, and the 5.x models refuse a thinking budget) and never `max_tokens`. A request for any other model, such as one of Claude Code's own background calls, and every request when the access names no effort, shall go to the provider as before, and its `llm.request` shall have no `effort`. The effort is applied after the bridge's other checks, so a request they refuse is refused as before.

## Examples

- Given an agent whose access names the effort `low` for `deepseek-v4.1-flash`,
  when Claude Code sends `{"model":"deepseek-v4.1-flash","output_config":{"effort":"high"},"thinking":{"type":"adaptive"}}`,
  then the provider gets `output_config.effort` `low`, `thinking` unchanged, and the `llm.request` has `effort: "low"`.
- Given the same agent,
  when Claude Code sends a request for that model with `output_config: {"format": {...}}` and no effort,
  then the provider gets `output_config` with the same `format` and `effort: "low"`.
- Given an agent whose access names the effort `low` for `gpt-5.5-mini`,
  when Codex sends `{"model":"gpt-5.5-mini","reasoning":{"effort":"high","summary":"auto"}}`,
  then the provider gets `reasoning: {"effort":"low","summary":"auto"}`.
- Given an agent whose access names the effort `low` for `deepseek-v4.1-flash`,
  when Claude Code sends a request for `claude-haiku-4-5`,
  then the provider gets the request as the program wrote it, and the `llm.request` has no `effort`.
- Given an agent whose access names no effort,
  when the program sends any request,
  then the provider gets it as before.
