# inbox.agent-item-bundles

- Status: active
- Since: unreleased
- Source: HAL-17422 plan, approved by the board on HAL-10 (24 Nov): feature 2, bundle cards and show waiting time; ADR `docs/adr/2026-11-24-agent-messaging.md`; task HAL-17441

When two or more open `AgentMessaging` inbox items belong to the same work, or have no work and come from the same agent, the Inbox shall list them as one row that says how many they are and how long the oldest of them has waited, and shall show each of them as its own card, oldest first, when that row is opened.

## Examples

- Given two open cards from Chief, asked at 10:00 and at 12:00,
  when the Inbox is opened at 13:00,
  then one row says "2 cards from Chief" and that they have waited 3 hours.
- Given that row,
  when the person opens it,
  then both cards show, the one from 10:00 first, and each is answered on its own.
- Given two open cards on the task ACME-12 from two agents,
  when the Inbox is opened,
  then one row says "2 cards on ACME-12" with the task's title.
