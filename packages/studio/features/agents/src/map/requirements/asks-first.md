# agents.map.asks-first

- Status: draft
- Since: unreleased
- Source: HAL-13180; flow-agents 6 (revision 15, Noah's N1: "1 tool asks first"); microcopy 19.7 (agent map card); UX checklist 9.9 asks first; HAL-15628 (C603: the engine's ask-first rule)

Where the agent map shows a connector, the agents feature shall show on its card the approval hand with the words "Every tool asks first" when none of its tools can run without asking by the engine's rule, else "Asks first, except N read-only tools", and shall add those words to the card's name.

## Examples

- Given "Mail triage" uses the connector "Acme mail", whose file has no `tools.read`, then its card shows "✋ Every tool asks first" and is named "Connector Acme mail, Every tool asks first".
- Given the connector says `tools.approve: all`, then its card shows "Every tool asks first".
- Given `tools.read` names `search_mail` and `read_mail`, and `tools.approve` names `read_mail`, then its card shows "Asks first, except 1 read-only tool".
- Given `tools.read` names two tools that agents can see and `tools.approve` names neither, then its card shows "Asks first, except 2 read-only tools".
- Given `tools.read` names a tool that `tools.allow` leaves out, then that tool isn't counted, because agents never see it.
