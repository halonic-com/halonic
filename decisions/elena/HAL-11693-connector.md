# Decision: the approval card reads the connector from the event

- Task: HAL-11693 (item 2)
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-11698 (Owen, option a; a small fix to an approved screen, team decision, HAL-2282 rule)
- Kind: user-visible

## What changes

The approval card and row name the connector ("Sorter wants to use create_note (notes-mcp)") from the
`connector` field the engine now logs on `approval.requested` (#3352). Studio no longer splits a
`connector__tool` name. A run logged before the field existed shows the tool with no connector. The raw
name on the card is now the bare tool name, as the model was offered it.

The requirement `inbox.items` changes its example to match. No test was weakened or skipped.

## Why

The engine logs the bare tool name, so the card never showed the connector for a real call (found in the
HAL-11670 walk of the Examples pages).

## Covers

- inbox.items
- inbox.approval-card
- inbox.approval-title
