# engine.run-agent-tools

- Status: active
- Since: 0.1.0
- Source: HAL-3565, step 4(d) of the HAL-186 plan, wired into runs as agreed on HAL-3338 and HAL-3388

When a workflow run calls a state's agent whose kept file sets `runLogs: true`, the engine shall offer it `list_runs` and `read_run` for its own hub's runs. When the file lists `collections` and the executor has a record store, the engine shall offer the records tools of each listed collection the run's kept definitions have. When the file lists `subagents`, the engine shall offer the `delegate_` tools of `engine.subagent-tools`, starting at depth 0. The engine shall offer these after Halonic's tools and the memory tools, and shall offer none of them in a chat turn, or to an agent whose file leaves those fields at their defaults or that the kept definitions have no file for.

When a `delegate_` tool runs in a run, the engine shall run the subagent's own turn on the task, on the model resolved for the subagent, with the subagent's own tools by these same rules one level deeper, and at most its `maxSteps` model calls. The engine shall check each of the subagent's calls as a run's calls are checked, except that a call that needs a person's OK shall be refused, with a reason that says a subagent can't wait for one, and the run shall not wait.

## Examples

- Given agent `writer` with `runLogs: true`, `collections: [invoices]` and `subagents: [checker]`, in a hub with both,
  when the run calls it,
  then the model is offered the memory tools, then `list_runs`, `read_run`, `find_invoices`, `add_invoices`, `update_invoices` and `delegate_checker`.
- Given agent `writer` whose file leaves those fields at their defaults,
  when the run calls it,
  then the model is offered the memory tools only.
- Given `writer` and `checker` that each list the other as a subagent,
  when each delegates as deep as it can,
  then the agent at depth 3 is offered no `delegate_` tool, and the answers go back up to the run.
- Given a subagent that calls a tool whose risk is `write`,
  when its turn runs,
  then the tool doesn't run, the subagent gets a refusal as the call's result, and the run completes without waiting.
