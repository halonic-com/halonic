# contracts.run-executor-not-found

- Status: active
- Since: 0.1.0
- Source: HAL-8281, from the #2396 review (HAL-8252, item 3); `RunExecutor` port v1, `RunTargetNotFound`

Where an adapter implements `RunExecutor`, it shall reject `start` and `startAgent` with a `RunTargetNotFound` (`isRunTargetNotFound` is true) whose `kind` and `id` say what is missing, when the request names a hub, a workflow or an agent that doesn't exist, and it shall record nothing. A hub that doesn't exist is `hub`, whatever else the request names.

## Examples

- Given a request to `start` in a hub the executor doesn't have,
  then it rejects with `kind: "hub"` and that hub's id.
- Given a hub that exists and a `start` of a workflow it doesn't have,
  then it rejects with `kind: "workflow"` and the workflow's id.
- Given a hub that exists and a `startAgent` of an agent it doesn't have,
  then it rejects with `kind: "agent"` and the agent's id.
