# engine.subagent-tools

- Status: active
- Since: 0.1.0
- Source: HAL-1533, step 4(d) of the HAL-186 plan; the old engine's `delegate_*` tools

When an agent has `subagents`, the engine shall give it, for each one, a tool `delegate_<id>` that hands a task to that subagent and answers with the subagent's answer, as text. It shall leave out a subagent that isn't an agent of the same hub, and the agent itself. When the agent is at the delegation depth limit (3 unless the caller sets another), it shall give no `delegate_` tools, so a loop of agents that delegate to each other ends.

When a `delegate_` tool runs, the engine shall run the subagent's own turn on the task, one level deeper, and shall log `agent.started` with the task as `prompt` before it, and `agent.finished` with the answer as `output` after it, each naming the state and the delegating agent as `parent`. When the subagent fails, the tool shall fail with the subagent's error and log no `agent.finished`, so the `agent.started` stays open and the `tool.result` carries the error. When the task is missing or empty, the tool shall fail with an error that names `task`, and run nothing.

## Examples

- Given a `reviewer` with `subagents: [checker, reviewer, ghost]` in a hub without `ghost`,
  when its tools are built,
  then it gets only `delegate_checker`.
- Given a `reviewer` with `subagents: [constructor, checker]` in a hub without `constructor`,
  when its tools are built,
  then it gets only `delegate_checker`.
- Given `reviewer` and `checker` that each list the other as a subagent,
  when each delegates as deep as it can,
  then the agent at depth 3 gets no `delegate_` tool.
