# events.usage-rollup

- Status: active
- Since: unreleased
- Source: HAL-17254, token phase 1e (direction on HAL-16892, sections 3 and 4); sessions as phase 1a logs them (`events.harness-session-start`, HAL-17250)

When a run's log is read for its usage, the events package shall add up the tokens of its model responses by the rule of `events.summary-cost` (an answer from the cache adds nothing), count the responses a model answered, keep apart the part used by sub-agents (the agents an `agent.started` with a `parent` started), count the harness sessions that began fresh, by reason, and those that resumed (`harness.started` with a `session`), and name the run's task and parent run. When several runs' usage is added up per task or per branch, it shall add up each of those numbers over the runs that name that task or branch, list the runs, and leave out the runs that name none.

## Examples

- Given a run on task `HAL-42` whose own agent used 100/20 tokens with 900 cache reads and whose sub-agent used 30/5 tokens, and a cached answer,
  when its usage is read,
  then the usage is 130 input, 25 output and 900 cache read tokens, the sub-agent usage is 30/5, there are 2 calls and the task is `HAL-42`.
- Given two harness sessions that started fresh with reason `no-resume`, and a `harness.started` without a session,
  when the run's usage is read,
  then there are 2 fresh starts with `{ "no-resume": 2 }` and no resumed one.
- Given two runs on task `HAL-42`, on branch `acme/HAL-42-reply`, and one run without a task,
  when their usage is added up per task and per branch,
  then `HAL-42` and `acme/HAL-42-reply` each have both runs' tokens, calls and sessions, and the run without a task is in neither.
- Given a log that doesn't start with `run.started`,
  when its usage is read,
  then there is none.
