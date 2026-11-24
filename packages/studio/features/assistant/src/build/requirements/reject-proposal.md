# assistant.build.reject-proposal

- Status: active
- Since: unreleased
- Source: HAL-16798 (T14 PR 8a); req-assistant (HAL-110); flow-assistant 3.3 and 3.4 (HAL-647); microcopy 14.2 (HAL-751)

When the person clicks **Reject all** on a proposal card, the chat shall reject what is left of the card's changes to review as one step, so the file is back as it was before them, take the card's actions away, show the toast "Rejected *n* changes in *item*" (one change: "Rejected 1 change in *item*") with **Undo**, and tell the model "(The person rejected the changes to *path*. The file is back as it was.)" with the person's next message, without showing that note in the chat.

## Examples

- Given a card with 1 change to review in `models.yaml`, when the person clicks Reject all,
  then the card's changes are rejected, the toast says "Rejected 1 change in models" with Undo, and the card has no actions.
- Given that reject, when the person sends the next message,
  then the model reads "(The person rejected the changes to models.yaml. The file is back as it was.)" first.
