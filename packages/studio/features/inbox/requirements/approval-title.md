# inbox.approval-title

- Status: active
- Since: 0.1.0
- Source: HAL-1218; HAL-5052 (the subagent, a team decision); [card requirements](/HAL/issues/HAL-64#document-requirements) INBOX-CARD-23 and 24; [ux-checklists-approvals](/HAL/issues/HAL-1250#document-ux-checklists-approvals) 2.1

The row and the card of a tool call waiting for an OK shall be titled "_Agent_ wants to use _tool_ (_connector_)", or "_Agent_ wants to use _tool_" for one of Halonic's own tools. A call a subagent asked for names the subagent first: "_Subagent_, for _Agent_, wants to use _tool_ (_connector_)". The title never uses the tool's or the connector's own description. The action's one-line summary is "_tool_ · _connector_", or the tool alone.

## Examples

- Given Sorter's call to `notes-mcp__create_note`,
  when the Inbox shows it,
  then the title reads "Sorter wants to use create_note (notes-mcp)" and the summary "create_note · notes-mcp".
- Given a call to Halonic's own `publish`,
  when the Inbox shows it,
  then the title reads "Sorter wants to use publish" and the summary "publish".
- Given a call to `notes-mcp__create_note` that the subagent Checker asked for Sorter,
  when the Inbox shows it,
  then the title reads "Checker, for Sorter, wants to use create_note (notes-mcp)".
