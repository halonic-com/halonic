# app.who-uses

- Status: active
- Since: 0.1.0
- Source: HAL-1303, P2; the Library's "Used by" lists and the delete confirmation read it

When the Library asks who uses a skill, a knowledge source, a collection or a connector, `whoUses` shall return, from the loaded workspace, the agents that list it (`skills`, `knowledge`, `collections`, `connectors`), the hubs that list it in `uses`, the routines whose mail trigger names it (connectors only), and the collections that have a `ref` field pointing at it (collections only). Each entry names its id, its name and the hub folder it sits in (`null` at the workspace root), in the order of the files' paths. A file that didn't parse shall not appear. An item nobody uses shall give four empty lists.

## Examples

- Given agents "Support" and "Billing" with `knowledge: [kb]` and a "Sales" agent without it,
  when `whoUses` is asked about the knowledge source `kb`,
  then the agents are "Support" and "Billing".
- Given a hub whose `uses.connectors` lists `gmail`,
  when `whoUses` is asked about the connector `gmail`,
  then that hub is among the hubs.
- Given a routine with a mail trigger on connector `gmail`,
  when `whoUses` is asked about the connector `gmail`,
  then that routine is among the routines.
- Given a collection `orders` with a `ref` field whose `collection` is `customers`,
  when `whoUses` is asked about the collection `customers`,
  then `orders` is among the collections, and `customers` itself is never.
- Given nothing lists the skill `triage`,
  when `whoUses` is asked about it,
  then agents, hubs, routines and collections are all empty.
