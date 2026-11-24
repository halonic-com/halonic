# inbox.every-waiting-item

- Status: draft
- Since: unreleased
- Source: the board's requirement on HAL-10 (24 Nov 10:35 UTC), relayed on HAL-17425: a card that sat only on a separate task was never seen; ADR `docs/adr/2026-11-24-agent-messaging.md`. Draft until track B lands; it then becomes active.

The Inbox shall be the one place that lists every item waiting on the person, whatever made it: a run, a workflow, a hub, a chat, a task or an `AgentMessaging` source. Where a chat, a task or a run also shows an item, the Inbox shall list it too, and answering it in either place shall answer it in both. Each item from an `AgentMessaging` source shall link back to the work or conversation it came from.

## Examples

- Given a card for the person on an Acme task that isn't a chat,
  when the source is read,
  then the card is in the Inbox and links back to that task.
- Given a question an agent asked in a Messenger chat,
  when the Inbox opens,
  then the question is in the Inbox as well as in the chat.
- Given that question,
  when the person answers it in the Inbox,
  then the chat shows it as answered.
