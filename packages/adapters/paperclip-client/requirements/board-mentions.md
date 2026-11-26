# paperclip-client.board-mentions

- Status: active
- Since: unreleased
- Source: HAL-19667 plan (Liam approved, 26 Nov), board-approved design on HAL-19491 (row "comment"); task HAL-19669

The Paperclip provider shall show as an inbox item of kind `comment` each comment that the agent-tools plugin's route `GET /api/plugins/halonic.agent-tools/api/board/mentions` (requirement `paperclip.board-mentions`) returns as mentioning the signed-in person: from the comment's author, with the task's title and the comment's first lines, linked to the task's page in Paperclip to answer it there (`answerElsewhere`). The provider shall never decide that a comment mentions the person from its text. When the task is closed, when the signed-in person has commented on the task after the mention, or when the mention is more than 14 days old, the provider shall no longer show it. If the route's read fails, the provider shall report the failure and still show the Inbox's other items.

## Examples

- Given the route returns Ada's comment on ACME-7 that mentions the board,
  when the Inbox is read,
  then it holds one `comment` item from Ada with ACME-7's page as the place to answer.
- Given the board commented on ACME-7 after that mention, or ACME-7 is done,
  when the Inbox is read,
  then the item is gone.
- Given a comment on ACME-7 says "Board, look" but the route doesn't return it,
  when the Inbox is read,
  then it holds no `comment` item.
- Given the route answers 500,
  when the Inbox is read,
  then the failure is reported and the cards and approvals still show.
