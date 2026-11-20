# studio.workspace-agents-make-live

- Status: draft
- Since: unreleased
- Source: HAL-14144; flow-agents 3.3 ("Review and make live"); `studio.workspace-routines-make-live`; `source-control.create-version-elsewhere`

When the desktop app gives the Agents feature a folder's agents, it shall give the agent's Make live, which opens source control's Create version with only the agent's own file in it and answers `made` once the version is created and `cancelled` when the person closed it without one; for an agent the hub doesn't have it shall reject with `not_found` and open nothing. Where the app has no Create version to open, the agents shall have no Make live, so the "Changes not live yet" line has no **Review and make live**.

## Examples

- Given Acme's hub with the agent `writer`, when its Make live is used, then Create version opens with only `hubs/acme/agents/writer.agent.yaml`, and Make live answers what Create version answered.
- Given an agent the hub doesn't have, then Make live rejects with `not_found` and Create version doesn't open.
- Given the app has no Create version to open, then the agents have no Make live.
