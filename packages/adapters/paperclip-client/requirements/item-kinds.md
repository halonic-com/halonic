# paperclip-client.item-kinds

- Status: active
- Since: unreleased
- Source: HAL-19491 (board approved Sofia's proposal: a badge says what kind of item it is, 26 Nov); task HAL-19665

The Paperclip provider shall give every inbox item it maps from Paperclip a `kind` (requirement `ports.agent-messaging-item-kind`): `approval` for an approval, a `request_confirmation` card, a `request_item_verdicts` card, a secret proposal and a join request; `question` for an `ask_user_questions` card, a `request_checkbox_confirmation` card, a `suggest_tasks` card and a decision; and `elsewhere` for a `connection_intent` card. When a card pins a stepper request the provider can read, its item shall have the kind `action` instead of the card's own kind. The provider shall give a card of any other kind no `kind`, so apps work it out from its fields. The kind of every item the provider lists shall agree with its fields (`inboxItemFits`).

## Examples

- Given an open approval, a pending confirmation card and a pending secret proposal,
  when the inbox is read,
  then each item has the kind `approval`.
- Given a pending checkbox card and an open decision,
  when the inbox is read,
  then each item has the kind `question`.
- Given a pending `connection_intent` card,
  when it is mapped,
  then its item has the kind `elsewhere`.
- Given a confirmation card that pins a stepper request Halonic can read,
  when the inbox is read,
  then its item has the kind `action`, and it holds together.
