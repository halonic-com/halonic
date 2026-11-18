# inbox.approval-title

- Status: active
- Since: 0.1.0
- Source: HAL-1218; HAL-11693 (the agent's name, not its id); HAL-5052 (the subagent, a team decision); card requirements (HAL-64) INBOX-CARD-23 and 24; ux-checklists-approvals (HAL-1250) 2.1

The row and the card of a tool call waiting for an OK shall be titled "_Agent_ wants to use _tool_ (_connector_)", or "_Agent_ wants to use _tool_" for one of Halonic's own tools. A call a subagent asked for names the subagent first: "_Subagent_, for _Agent_, wants to use _tool_ (_connector_)". The title never uses the tool's or the connector's own description. The action's one-line summary is "_tool_ · _connector_", or the tool alone.

## Examples

- Given Sorter's call to `create_note` from the connector `notes-mcp`,
  when the Inbox shows it,
  then the title reads "Sorter wants to use create_note (notes-mcp)" and the summary "create_note · notes-mcp".
- Given a call to Halonic's own `publish`,
  when the Inbox shows it,
  then the title reads "Sorter wants to use publish" and the summary "publish".
- Given a call to `create_note` from the connector `notes-mcp` that the subagent Checker asked for Sorter,
  when the Inbox shows it,
  then the title reads "Checker, for Sorter, wants to use create_note (notes-mcp)".
- Given Sorter's agent file says `name: Mail sorter`,
  when the Inbox, Home's Needs you or the run page's banner shows its call,
  then they say "Mail sorter", never the id `sorter`; only when the file can't be read do they say the id.
