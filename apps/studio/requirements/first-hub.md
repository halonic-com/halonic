# studio.first-hub

- Status: draft
- Since: unreleased
- Source: HAL-14119; board answer on HAL-12723 ("Can we not make a \"Default\" hub?"); builds on `workspace.default-hub`, `studio.workspace-agents`

When the desktop app creates an agent or a workflow in the Default hub (`hubs/default`) of a folder that has no hub, it shall write the Default hub's `hub.yaml` in the same undoable change as the new file. It shall still refuse, without writing, any other hub the folder doesn't have, and the Default hub when the folder has other hubs.

## Examples

- Given a folder with only `workspace.yaml`, when the agent "Greeter" is created in `default`, then one change writes `hubs/default/hub.yaml` and `hubs/default/agents/greeter.agent.yaml`, and the hubs are then Default alone.
- Given the same folder, when the workflow "Daily summary" is created in `default`, then one change writes `hubs/default/hub.yaml` and `hubs/default/workflows/daily-summary.workflow.yaml`.
- Given the same folder, when an agent or a workflow is created in `acme`, then it is refused with `not_found` and nothing is written.
- Given a folder with the hub `acme`, then an agent is made in `acme` with no Default hub, and an agent in `default` is refused.
