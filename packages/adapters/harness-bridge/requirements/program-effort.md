# harness-bridge.program-effort

- Status: active
- Since: unreleased
- Source: HAL-17262 (follow-up of HAL-17250: see how much effort a pinned harness asks for on each call)

When the program's `POST /v1/messages` names an effort in `output_config.effort`, or its `POST /v1/responses` names one in `reasoning.effort`, and that effort is `none`, `minimal`, `low`, `medium`, `high`, `xhigh` or `max`, the Node bridge shall record it as the `programEffort` of the call's `llm.request`, whether or not the bridge sends the provider another effort (requirement `harness-bridge.effort`). It shall record no `programEffort` when the program named no effort, or a value outside that list, and it shall send the request as before either way.

## Examples

- Given an agent whose access names the effort `low` for `cheap-model`,
  when Claude Code sends `{"model":"cheap-model","output_config":{"effort":"high"}}`,
  then the `llm.request` has `effort: "low"` and `programEffort: "high"`.
- Given an agent whose access names no effort,
  when Codex sends `{"model":"gpt-5.5","reasoning":{"effort":"xhigh"}}`,
  then the `llm.request` has `programEffort: "xhigh"` and no `effort`.
- Given any agent,
  when the program sends `output_config: {"effort": "turbo"}` or no effort at all,
  then the `llm.request` has no `programEffort`.
