# events.timeline-entry-id

- Status: active
- Since: 0.1.0
- Source: spec "Run events: the timeline entry id" on HAL-970 (sections 1, 3 and 4), for accessibility check L7 on HAL-966

The `entry` of a run event, which any run event may have, is the `seq` of the event that opened its timeline entry. The events package shall work out each event's entry with `entryOf(events)`. An event that has `entry` keeps it. An event that updates an entry (table below) gets the `seq` of the latest still-open opener of the matching type with the same `branch`, `item` and "matched on" fields. Every other event gets its own `seq`.

| Opens an entry       | Updated later by                | Matched on                 |
| -------------------- | ------------------------------- | -------------------------- |
| `run.started`        | `run.completed`, `run.failed`   | the run                    |
| `state.entered`      | `transition` out of that state  | `state` = `from`           |
| `agent.started`      | `agent.finished`                | `state`, `agent`, `parent` |
| `llm.request`        | `llm.response`, `llm.fallback`  | `agent`                    |
| `tool.called`        | `tool.result`                   | `agent`, `tool`            |
| `approval.requested` | `approval.resolved`             | `callId`                   |
| `workflow.started`   | `workflow.finished`             | `childRunId`               |
| `run.waiting`        | `timer.fired`, `event.received` | the run                    |

An updating event finishes its entry, so later events can't update it, except `llm.fallback`: the call goes on with the fallback model and its `llm.response` updates the same entry.

## Examples

- Given `run.started` (seq 1) and `run.completed` (seq 2), or `run.failed` (seq 2),
  when their entries are worked out,
  then both events have entry 1.
- Given `state.entered` "a" (seq 1), `state.entered` "b" (seq 2) and `transition` from "a" (seq 3),
  when their entries are worked out,
  then the transition has entry 1.
- Given `agent.started` and `agent.finished` for agent "w" in state "s", with a subagent "x" of "w" started and finished in between,
  when their entries are worked out,
  then each `agent.finished` has the entry of its own `agent.started`.
- Given `llm.request` for agent "w" (seq 1), `llm.fallback` (seq 2) and `llm.response` (seq 3),
  when their entries are worked out,
  then all three have entry 1.
- Given `tool.called` for tools "search" (seq 1) and "fetch" (seq 2) and their `tool.result`s in the other order,
  when their entries are worked out,
  then each result has the entry of the call to its own tool.
- Given `approval.requested` with callIds "c1" (seq 1) and "c2" (seq 2), resolved "c2" first,
  when their entries are worked out,
  then each `approval.resolved` has the entry of its own request.
- Given `workflow.started` with childRunIds "k1" (seq 1) and "k2" (seq 2), finished "k2" first,
  when their entries are worked out,
  then each `workflow.finished` has the entry of its own start.
- Given `run.waiting` (seq 1) followed by `timer.fired` (seq 2), or by `event.received` (seq 2),
  when their entries are worked out,
  then both events have entry 1.
- Given `event.received` while the run isn't waiting,
  when its entry is worked out,
  then it is its own `seq`.
- Given `knowledge.searched`, `artifact.created`, `context.updated` and `signal.sent`,
  when their entries are worked out,
  then each is its own `seq`.
- Given the same agent started in parallel branches "left" and "right", finishing "left" second,
  when their entries are worked out,
  then each `agent.finished` has the entry of the `agent.started` of its own branch.
- Given the same tool called for for-each items 0 and 1, with item 1's result first,
  when their entries are worked out,
  then each `tool.result` has the entry of the call of its own item.
- Given the same state entered, left and entered again,
  when their entries are worked out,
  then the second `transition` has the entry of the second `state.entered`.
- Given an old log without `entry` and the same log with the `entry` the engine writes,
  when their entries are worked out,
  then both give the same entries, and an event's own `entry` is kept as it is.
