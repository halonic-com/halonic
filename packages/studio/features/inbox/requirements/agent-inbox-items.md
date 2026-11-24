# inbox.agent-inbox-items

- Status: draft
- Since: unreleased
- Source: HAL-17422 plan, approved by the board on HAL-10 (24 Nov), with the board's direction of 24 Nov 10:18 and 10:20 UTC (apps talk only to the engine; desktop and server engines); ADR `docs/adr/2026-11-24-agent-messaging.md` (features 1 and 2); Julian's security review HAL-17436 (finding 3). Draft until track B lands; it then becomes active.

The Inbox shall list the open inbox items of every `AgentMessaging` source next to its other items, with the source's label and how long each item has waited, and shall answer through `AgentMessaging.answer`. When the answer comes back as already answered, the Inbox shall show the item as answered elsewhere, with who answered it and how. The Inbox shall render an item's question with no raw HTML, scripts or `javascript:` links, open links outside the app and load no image on its own. A notification shall only open the Inbox, never answer an item.

## Examples

- Given an open item from the source "Paperclip · Acme" that has waited 3 hours,
  when the Inbox is opened,
  then the item shows "Paperclip · Acme" and that it has waited 3 hours.
- Given an item answered in another client,
  when the person answers it in the Inbox,
  then the Inbox shows it as answered elsewhere, by whom and how.
- Given a question that holds `<img src="https://evil.test/x">`,
  when the Inbox shows it,
  then no request goes to `evil.test`.
