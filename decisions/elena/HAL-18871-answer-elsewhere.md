# Decision: Paperclip's checkbox and task cards offer Reject, and unknown kinds link to Paperclip

- Task: HAL-18871
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-18871 (Liam approved the port fields and this follow-up, 25 Nov)
- Kind: internal

## What changes

`paperclip-client.card-kinds` said a checkbox, verdict or task card's item has no `options`. With the port
fields from #6257, a checkbox or task card's item now offers Reject next to its question (needing a note when
the card requires a reason), a checkbox card's defaults become `preselected`, a card of a kind Halonic can't
answer links to its task's page with `answerElsewhere`, and a card that fails `inboxItemFits` is left out. The
requirement's wording changes to say so, and gains two examples. Its test now expects the Reject option where
it expected none; no test was weakened or skipped.

## Why

No dead cards in Inbox and Messenger (board ask, HAL-18861). Liam approved the fields and asked for the
`inboxItemFits` check in his review of #6257.

## Covers

- paperclip-client.card-kinds
