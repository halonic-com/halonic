# assistant.build.card-states

- Status: active
- Since: unreleased
- Source: HAL-16799 (T14 PR 8b); flow-assistant 3.3 and 4.1 (HAL-647); microcopy 14.2 (HAL-751)

When nothing on a proposal card is left to review, wherever its changes were decided, the card shall replace its actions with a `neutral` state chip, never green and never a checkmark: **Accepted** with the line "Now a change in *item*. Undo it in Changes ›", where "Changes ›" opens Changes; **Accepted *k* of *n*** with the same line when some changes were accepted and the rest rejected; or **Rejected**, without the why. The model shall be told "(The person accepted *k* of *n* changes to *path* and rejected the rest.)" for a partly accepted card. When the decision was made on the card, focus shall move to the state line. When the changes come back to review after an Undo, the card shall show its actions again.

## Examples

- Given a card with 3 changes, when the person accepts 2 in the item and rejects the last one there,
  then the card shows the chip "Accepted 2 of 3" and "Now a change in triage. Undo it in Changes ›".
- Given that card, when the person sends the next message,
  then the model reads "(The person accepted 2 of 3 changes to <path> and rejected the rest.)".
- Given a card whose changes the person rejected with Reject all,
  then the card shows the chip "Rejected", no why, and focus is on the state line.
