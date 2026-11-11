# events.agent-resume-inner

- Status: active
- Since: 0.1.0
- Source: HAL-3361 (subagents wait for an OK and for the effect step, design reviewed on HAL-4700); plan row E5 on HAL-9

The events package shall let an `AgentResume` hold, in an optional `inner`, the subagent that a `delegate_*` call at `calls[0]` waits on and that subagent's own `AgentResume`, so a run that stopped inside a subagent goes on from there after a restart. `inner` nests at most 3 deep, as deep as delegation goes, and holds plain JSON with no secrets, as the rest of `resume` does. An `approval.requested` or `effect.requested` event whose call a subagent made shall name that subagent in an optional `subagent`; `agent` stays the state's agent. Logs written before these fields existed read as before.

## Examples

- Given an `AgentResume` with `inner: { agent: "checker", resume }`,
  when its type is checked,
  then it is a valid `AgentResume`, and so is one without `inner`.
- Given an `approval.requested` log line whose `resume.inner` holds a `checker` whose own `resume.inner` holds a `reader`,
  when the line is parsed,
  then both levels come back as written, with `subagent: "reader"`.
- Given an `approval.requested` log line written before `inner` and `subagent` existed,
  when the line is parsed,
  then it reads as before, with neither field.
