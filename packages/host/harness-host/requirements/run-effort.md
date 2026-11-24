# harness-host.run-effort

- Status: active
- Since: unreleased
- Source: HAL-17252 (token phase 1c, plan approved by Liam on the task)

When the bridge host opens a harness run's bridge for an agent whose run has an effort (requirement `engine.run-effort`), it shall tell the host's `servicesFor` that effort as `runEffort`. When `runEffort` is `low`, `ProviderKeyServices` shall give the access the low effort for the model the program is asked for, in place of the agent file's `params.reasoningEffort` and its alias's, so the bridge sets it on the call and records it on its `llm.request` (requirement `harness-bridge.effort`). When `runEffort` is `default` or absent, the effort shall be chosen as requirement `harness-host.bridge-effort` says.

## Examples

- Given an agent file with `params: { reasoningEffort: high }` in a run with `runEffort: "low"`,
  when its bridge's services are asked for,
  then its access has the effort `low` for its model.
- Given the same agent file in a run with `runEffort: "default"`, or none,
  when its bridge's services are asked for,
  then its access has the effort `high` for its model.
- Given an agent whose file and alias set no effort, in a run with `runEffort: "low"`,
  when its bridge's services are asked for,
  then its access has the effort `low` for its model.
