# assistant.build.apply-proposal

- Status: active
- Since: unreleased
- Source: HAL-16798 (T14 PR 8a); req-assistant (HAL-110); flow-assistant 3.3 and 3.4 (HAL-647); microcopy 14.2 (HAL-751)

When the person clicks **Accept all** on a proposal card, the chat shall accept what is left of the card's changes to review as one step, take the card's actions away, show the toast "Accepted *n* changes in *item*" (one change: "Accepted 1 change in *item*") with **Undo**, and tell the model "(The person accepted the changes to *path*.)" with the person's next message, without showing that note in the chat. When the person clicks **Undo** on that toast, the chat shall put the changes back to review in one step, show the card's actions again and not tell the model.

## Examples

- Given a card with 3 changes to review in Support triage, when the person clicks Accept all,
  then the toast says "Accepted 3 changes in Support triage" with Undo, and the card has no actions.
- Given that accept, when the person sends "Thanks",
  then the model reads "(The person accepted the changes to <path>.)" with "Thanks", and the chat shows only "Thanks".
- Given that accept, when the person clicks Undo on the toast,
  then the changes are back to review and the card shows Accept all again.
