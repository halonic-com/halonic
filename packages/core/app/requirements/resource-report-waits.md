# app.resource-report-waits

- Status: active
- Since: 0.1.0
- Source: HAL-189 stack 5c; failure-path guide rules 1 and 3 (HAL-1668); `events.started-events` and `events.connector-started`

The resource report shall list what the running and waiting runs are waiting for, oldest first, worked out from their run logs. While a run is waiting, it shall list the run's wait from its last `run.waiting`, with the events it accepts, the approvals it waits for and its next timer. While a `sandbox.started`, `harness.started` or `connector.started` event has no later event from the same step (the same agent, branch and for-each item, naming the same state or none), it shall list that wait with how long it has waited and its time limit, and shall mark it overdue once it has waited longer than that limit. A run that has ended shall have no waits.

## Examples

- Given a run whose harness `claude-code` started at 10:00:00 with a 60 s limit and nothing after it,
  when the report is read at 10:00:04,
  then it lists a harness wait of 4 s, not overdue; read at 10:01:30, it is overdue.
- Given a `sandbox.started` followed by a `sandbox.opened` for the same agent and state,
  when the report is read,
  then the sandbox isn't listed as a wait.
- Given a `connector.started` followed by the `tool.result` of the same agent, which names no state,
  when the report is read,
  then the connector isn't listed as a wait.
- Given two parallel branches with the same agent, where branch `a` started a harness and branch `b` wrote a later event,
  when the report is read,
  then branch `a`'s harness is still listed.
- Given a run waiting since 09:00 for `approve` or `reject` with one approval,
  when the report is read,
  then it lists that run's wait since 09:00 with both events and one approval.
