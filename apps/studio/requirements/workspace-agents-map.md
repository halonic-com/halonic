# studio.workspace-agents-map

- Status: draft
- Since: unreleased
- Source: HAL-13180 (T6, the agent map, PR 6); flow-agents 6 (routines on the left, "1 tool asks first"); microcopy 19.7; HAL-15628 (C603: the engine's ask-first rule)

The desktop app's agents host shall answer the routines that start an agent, from any hub or the workspace's root, in the workspace's order, by their hub, id and name, and shall give each connector it offers an agent the number of its tools that can run without asking first by the engine's rule: those `tools.read` names that `tools.approve` doesn't and `tools.allow` lets agents see; for an agent the hub doesn't have it shall reject with `not_found`.

## Examples

- Given the routine `morning` of the hub `acme` runs the agent `writer`, then the routines of `writer` are `morning` with its name; a routine that runs a workflow or another agent isn't one of them.
- Given a root routine runs `writer` with `hub: acme`, then it is one of them, with no hub.
- Given the connector `mail` has no `tools.read`, then it is offered with 0 tools that run without asking, because every tool asks first; given `tools.approve: all`, also 0.
- Given `tools.read: [search_mail, read_mail]` and `tools.approve: [read_mail]`, then 1.
- Given `tools.read: [search_mail, read_mail]` and `tools.allow: [send_mail, search_mail]`, then 1, because agents never see `read_mail`.
