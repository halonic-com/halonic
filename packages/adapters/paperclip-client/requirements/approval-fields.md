# paperclip-client.approval-fields

- Status: active
- Since: unreleased
- Source: board ask on HAL-18861 (every Paperclip approval works in Inbox and Messenger), gap table on HAL-18861; task HAL-18872

The Paperclip provider shall start every approval's question with its type in words, "Hire an agent", "Approve the strategy", "Budget override" or "Board approval", and "Approval: _type_" for a type it doesn't know, followed by the asking agent's title and summary and then the type's own fields: for `hire_agent` the name, role, adapter and monthly budget; for `approve_ceo_strategy` the plan; for `budget_override_required` what is over budget, its limit, what was spent and a line saying that approving records the answer only and leaves the budget and the paused work as they are; for `request_board_approval` the recommended action and the risks. Every approval shall offer Approve, Reject and Request changes; Request changes shall send `POST /api/approvals/{id}/request-revision` with the person's note as `decisionNote`. When an approval is `revision_requested`, the provider shall list it as answered with Request changes, so it shows as waiting on the agent with no buttons.

When a confirmation is bound to a document, the provider shall name it in the question with its revision. When a confirmation asks to run a tool (`payload.toolAction`), the provider shall show the tool, its app and its arguments, and mark the item `risky`. When a confirmation says `rejectRequiresReason`, the provider shall refuse a reject without a note instead of sending it.

## Examples

- Given a pending `hire_agent` approval for Iris, role designer, adapter `claude_local`, budget 5000 cents,
  when the inbox is read,
  then its question starts "Hire an agent" and lists "Name: Iris", "Role: designer", "Adapter: claude_local" and "Monthly budget: $50.00".
- Given a pending `budget_override_required` approval for the Website project, limit 10000 cents, 12550 spent,
  when the inbox is read,
  then its question lists "For: Website", "Limit: $100.00" and "Spent: $125.50", and says the budget stays the same until it is raised in Paperclip.
- Given a pending approval,
  when the person picks Request changes with the note "Lower the budget",
  then the provider sends `request-revision` with `{ "decisionNote": "Lower the budget" }`.
- Given an approval in `revision_requested`,
  when the inbox is read,
  then it is listed as answered with Request changes.
- Given a confirmation whose `toolAction` runs `send_mail` in Acme Mail,
  when the inbox is read,
  then the question names "Tool: send_mail (Acme Mail)" with its arguments, and the item is `risky`.
