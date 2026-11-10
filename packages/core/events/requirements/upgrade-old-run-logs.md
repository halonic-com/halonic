# events.upgrade-old-run-logs

- Status: active
- Since: 0.1.0
- Source: old app at commit 784f78d, old test `legacy.test.ts` "reads old run logs that say projectId" and "… flowId"

When a stored `run.started` event has `projectId` or `flowId` and not the new name, the events package shall read it with `hubId` or `workflowId` instead and drop the old field. Other events are read unchanged.

## Examples

- Given a `run.started` event with `projectId: "p"` and no `hubId`,
  when it is upgraded,
  then it has `hubId: "p"` and no `projectId`.
- Given a `run.started` event with `flowId: "greet"` and no `workflowId`,
  when it is upgraded,
  then it has `workflowId: "greet"` and no `flowId`.
- Given a `run.started` event that has both `workflowId` and `flowId`,
  when it is upgraded,
  then both stay as they are.
- Given a `state.entered` event,
  when it is upgraded,
  then it is returned unchanged.
- Given a run log written before `tool.result.outcome`, `run.failed.reason` and `approval.resolved.by` existed,
  when each line is parsed and the log is summarized,
  then every event is read exactly as written, none of the three fields is added, and the summary gives the same facts as before (its one waiting approval, while it waited, as a list of one).
- Given a run log written before `llm.skipped` and `llm.response.toolCallAsText` existed,
  when each line is parsed,
  then every event is read exactly as written: its `llm.response` has no `toolCallAsText`, no `llm.skipped` is added, and its `run.failed` keeps no `reason`.
- Given a run log written before `tool.result.risk`, `tool.result.noun` and `tool.result.verb` existed,
  when each line is parsed,
  then every `tool.result` is read exactly as written, with none of the three added.
- Given a run log written before `tool.result.resultBlob` existed,
  when each line is parsed,
  then every `tool.result` is read exactly as written, without `resultBlob`.
