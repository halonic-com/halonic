# search.across-sources

- Status: draft
- Since: unreleased
- Source: HAL-17422 plan, approved by the board on HAL-10 (24 Nov); ADR `docs/adr/2026-11-24-agent-messaging.md` (feature 14); task HAL-17447. Draft until track B lands; it then becomes active.

When the person types a query, search shall ask every `AgentMessaging` source for it and shall show the hits grouped by kind (agents, chats, messages, inbox items, work) and, within each kind, by source, under the source's label. When the query is empty or only spaces, search shall make no search call and shall show no hits. When the person picks a hit, search shall open it in its app. Search shall draw titles and excerpts as plain text only.

## Examples

- Given an agent "Chief" and the work `ACME-1` "Chief's launch plan" in "Paperclip · Acme",
  when the person searches for "chief",
  then the results show "Agents" with Chief and "Work" with `ACME-1`, each under "Paperclip · Acme".
- Given any sources,
  when the query is empty,
  then no search is made.
- Given a hit whose excerpt is `<img src=x onerror=alert(1)>`,
  when it is shown,
  then it reads as that text and no image is drawn.
