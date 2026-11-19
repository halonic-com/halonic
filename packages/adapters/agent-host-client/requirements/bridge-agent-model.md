# agent-host-client.bridge-agent-model

- Status: active
- Since: unreleased
- Source: HAL-12488 (plan approved by Liam in HAL-12505)

When the stand-in bridge host opens an agent's bridge, it shall tell Studio's `servicesFor` the run, the agent, the agent's hub and the agent file's `model` exactly as written, before any mapping, and nothing else of the engine's agent. When the agent's file names no model, it shall name none.

## Examples

- Given an agent in hub `acme` whose file says `model: open-coder-agent`,
  when the engine opens its bridge,
  then `servicesFor` gets `{ runId, agentId, hubId: "acme", model: "open-coder-agent" }`.
- Given an agent whose file names no model,
  when the engine opens its bridge,
  then `servicesFor` gets the run, the agent and its hub, and no `model`.
