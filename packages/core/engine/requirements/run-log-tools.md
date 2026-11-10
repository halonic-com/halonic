# engine.run-log-tools

- Status: active
- Since: 0.1.0
- Source: HAL-1533, step 4(d) of the HAL-186 plan; the old engine's `list_runs` and `read_run`

The engine shall give an agent with `runLogs: true` two read-only tools, `list_runs` and `read_run`, that show only the runs of the agent's own hub.

`list_runs` shall list the hub's runs (not test runs) that started within the last `days` days (1 to 90, default 7), newest first, at most `limit` of them (1 to 200, default 50), filtered by `workflow` and `status` when given, and leaving out the run the agent is in. Each run shall be one line of id, workflow, trigger, status, start, duration, tokens, cost and error, joined with `|`. When no run matches, it shall answer `No runs in that period.`

`read_run` shall show the run with the given `runId` one event per line: states, agents, model calls with tokens, cost and latency, tool calls and results cut to 200 characters, approvals, waits and the end. When the run doesn't exist or belongs to another hub, it shall answer `Unknown run.`

When an argument has the wrong type or is out of range, the tool shall fail with an error that names the argument.

## Examples

- Given an `acme` run that completed in 12 s and a `globex` run,
  when an `acme` agent calls `list_runs`,
  then it gets one line, `r-1 | invoices | manual | completed | … | 12s | 120+30 tokens | cost 0.0042 | `.
- Given a `globex` run `r-9`,
  when an `acme` agent calls `read_run` with `runId: "r-9"`,
  then it gets `Unknown run.`
- Given `days: 0`,
  when `list_runs` runs,
  then it fails with `"days" must be from 1 to 90 (got 0)`.
