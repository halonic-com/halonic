# paperclip-client.closed-items

- Status: active
- Since: unreleased
- Source: HAL-19496 (board report on HAL-10: a card decided, cancelled or expired in Paperclip should update in Messenger and Inbox, with its final state); plan approved by Liam, who decided that a `failed` card reads as cancelled

The Paperclip provider shall list a card that ended without an answer as `closed`: `cancelled` for a cancelled or failed card, `expired` for an expired one, at the time Paperclip resolved it and, only when Paperclip names who resolved it, with that person or agent. When an approval or a decision it listed last time is gone from Paperclip's list of waiting ones, the provider shall read that one again (`GET /api/approvals/{id}`, or the company's decisions that are decided, expired or cancelled, in that order and only while one is still unfound) and list it with its final state: `answered` with the option and who decided it, or `closed` with its reason; one it can't find shall be `closed` as `cancelled` from the time it was missed. It shall keep listing such an ended approval or decision for 24 hours after it ended, at most the 50 that ended last, and read nothing again for an item that never left the list. If a read for one fails, then the list shall fail and the next list shall read it again.

## Examples

- Given a card the board cancelled at 10:05,
  when the inbox is listed,
  then the card is `closed`, `cancelled` at 10:05, by the board.
- Given a failed card and an expired card that name no one,
  when the inbox is listed,
  then they are `closed`, `cancelled` and `expired`, with no one named.
- Given a pending approval that was listed, then approved by another board member in Paperclip,
  when the inbox is listed again,
  then the approval is read once and listed as answered with Approve, by the board.
- Given a listed decision that is gone from the open ones and found among the expired ones,
  when the inbox is listed again,
  then it is `closed`, `expired`, and the cancelled ones are not read.
- Given 60 approvals and decisions that ended in the last day and one that ended 25 hours ago,
  when the inbox is listed,
  then only the 50 that ended last are listed.
