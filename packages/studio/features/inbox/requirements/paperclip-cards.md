# inbox.paperclip-cards

- Status: draft
- Since: unreleased
- Source: HAL-17422 plan (features 1 and 2), approved by the board on HAL-10 (24 Nov); ADR `docs/adr/2026-11-24-paperclip-connection.md`. Draft until track B lands; it then becomes active.

The Inbox shall list each connected Paperclip's open cards next to its other items, with the connection's name and how long each card has waited, and shall send an answer back through the `PaperclipSource` of the connection the card came from. When Paperclip reports a card as already answered, the Inbox shall show it as answered elsewhere, with who answered it and how. A notification shall only open the Inbox, never answer a card.

## Examples

- Given an open card from the connection `acme` that has waited 3 hours,
  when the Inbox is opened,
  then the card shows "acme" and that it has waited 3 hours.
- Given a card the board answered in Paperclip's own page,
  when the board answers it in the Inbox,
  then the Inbox shows it as answered elsewhere, by whom and how.
