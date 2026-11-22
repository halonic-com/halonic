# agents.map.asks-first

- Status: draft
- Since: unreleased
- Source: HAL-13180; flow-agents 6 (revision 15, Noah's N1: "1 tool asks first"); microcopy 19.7 (agent map card); UX checklist 9.9 asks first

Where a connector on the agent map has tools that wait for a person's approval before they run, the agents feature shall show on its card the approval hand with the words how many tools ask first, or "every tool asks first" when its file says every one does, and shall add those words to the card's name.

## Examples

- Given "Mail triage" uses the connector "Acme mail", whose `tools.approve` names `send_mail`, then its card shows "✋ 1 tool asks first" and is named "Connector Acme mail, 1 tool asks first".
- Given the connector names `send_mail` and `delete_mail`, then its card shows "2 tools ask first".
- Given the connector "notes-mcp" says `tools.approve: all`, then its card shows "every tool asks first".
- Given a connector with no tool under `tools.approve`, then its card shows no hand and no words.
- Given `tools.approve` names a tool that `tools.allow` leaves out, then that tool isn't counted, because agents never see it.
