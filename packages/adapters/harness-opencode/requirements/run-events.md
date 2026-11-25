# harness-opencode.run-events

- Status: active
- Since: unreleased
- Source: HAL-16826 (plan, step 4: run events); HAL-18152, recorded with OpenCode 2.3.0

The OpenCode harness shall read each line of `opencode run --format json` as one JSON object. A `tool_use` line shall become `tool.called` and `tool.result` for the task agent, with outcome `ok` when its state is `completed` and `error` otherwise, except a call to a tool of the bridge's MCP server, which the bridge records. `step_start` and `step_finish` shall report no model call, since the bridge records each one with its tokens and cost. When OpenCode exits well after at least one step finished, the run shall end with one `agent.finished` whose output is the text of the last step. An `error` line shall end the run with an error that gives OpenCode's message. A line that isn't a JSON object with a `type` shall end the run with an error that doesn't quote it. Line types it doesn't know shall be skipped. No event or error shall hold the bridge token.

## Examples

- Given the recorded 2.3.0 run with a `read` call, a `shell` call and a final answer,
  when the reader reads it and OpenCode exits well,
  then it reports both calls and `agent.finished` with "The file says hello from acme.".
- Given an `error` line saying "The bridge refused the model acme-other.",
  when the reader reads it,
  then the run ends with "OpenCode stopped with an error: The bridge refused the model acme-other.".
