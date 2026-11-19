# harness-host.bridge-agent-model

- Status: active
- Since: unreleased
- Source: HAL-12488 (plan approved by Liam in HAL-12505)

When the bridge host opens a harness run's bridge, it shall tell the host's `servicesFor` the agent's hub and the agent file's `model` exactly as written, before any mapping, so the host can resolve a `models.yaml` alias to the provider the agent's calls go to. When the agent's file names no model, it shall name none.

## Examples

- Given an agent whose file says `model: open-coder-agent`,
  when the engine opens its bridge,
  then `servicesFor` gets the run, the agent, its hub and `open-coder-agent`.
- Given an agent whose file names no model,
  when the engine opens its bridge,
  then `servicesFor` gets the run, the agent and its hub, and no model.
