# events.tool-step-marker

- Status: active
- Since: unreleased
- Source: HAL-18635 (the `tool` step kind, `engine.tool-state`), with the plan rev 1 approved there

The `effect.requested` and `approval.requested` events shall be able to say that a tool step, not an agent, made or asks for the call, in an optional `step` whose only value is `"tool"`; `agent` then names the step. A run summary's waiting approval shall copy it. Logs written before the field existed, and every event of an agent's call, stay valid and read without it.

Rationale: a reader such as Studio's approval card can then name the step instead of showing its id as an agent's name, and the engine doesn't wait for an agent to go on after the call.

## Examples

- Given an `approval.requested` log line with `agent: "merge"` and `step: "tool"`,
  when the line is parsed and summarized,
  then the waiting approval has `step: "tool"`.
- Given an `approval.requested` log line written before `step` existed,
  when the line is parsed and summarized,
  then it reads as before, with no `step`.
- Given the types of `effect.requested` and `approval.requested`,
  when `step` is checked,
  then it is the optional value `"tool"`.
