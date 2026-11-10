# app.review-starts-nothing

- Status: active
- Since: 0.1.0
- Source: HAL-65 section F, `workspace.trust.review-starts-nothing` and `workspace.trust.assistant-authoring-exception` condition 5 (HAL-3268); HAL-3353

If the review service writes a change to review, accepts it or rejects it, then the workspace's watch shall report no batch for it, so no routine trigger, run or preview reload that listens to the watch starts because of it. The review service shall not create or update a trust record.

## Examples

- Given a trusted workspace with an open watch,
  when the assistant writes `agents/clerk.agent.yaml` and a new `routines/nightly.routine.yaml`, the first is rejected and the second accepted,
  then the watch reports no batch.
