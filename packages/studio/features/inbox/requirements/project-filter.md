# inbox.project-filter

- Status: active
- Since: unreleased
- Source: the board's requirement on HAL-10 (24 Nov 11:05 UTC), relayed on HAL-17425; ADR `docs/adr/2026-11-24-agent-messaging.md`.

The Inbox shall let the person keep its list to one project from a choice above the list that names every project its items belong to and "No project" for items without one: in one click for a choice on its line, or two from its "+N" menu (`inbox.project-line`). The choice shall combine with All and Waiting for me.

## Examples

- Given items in the projects Website and Billing and one with no project,
  when the person picks Website,
  then only the Website item is listed.
- Given that list,
  when the person picks "No project",
  then only the item with no project is listed.
- Given Website picked and Waiting for me on,
  when the list shows,
  then it holds only Website items that wait for the person.
