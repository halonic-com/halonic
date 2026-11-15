# app.references-to

- Status: active
- Since: 0.1.0
- Source: HAL-1293, PR 5; the rename dialog's "Also updates 3 places" line and the delete warnings of T6 and T7 read it

When a Library item is renamed or deleted, `referencesTo` shall return, from the loaded workspace, every place in a file that names the item's id: an entry of an agent's `skills`, `knowledge`, `collections` or `connectors` list, an entry of a hub's `uses` list, the `connector` of a routine's mail trigger (connectors only) and the `collection` of a `ref` field, also of the collection itself (collections only). Each place names its file, its path inside the file as `editYaml` takes it, and the name of its owner. The places shall be in the order of the files' paths, then of their position in the file. The same files count as for `whoUses`: a hub's own item is named only from inside that hub, and a shared item is not named from a hub that has its own item with that id. A file that didn't parse shall not appear. An item nothing names shall give an empty list.

## Examples

- Given agents "Support" and "Billing" with `knowledge: [kb]`,
  when `referencesTo` is asked about the knowledge source `kb`,
  then the places are `knowledge` entry 0 of each agent's file.
- Given an agent with `skills: [pitch, triage]`,
  when `referencesTo` is asked about the skill `triage`,
  then the place is `skills` entry 1.
- Given a routine with a mail trigger on connector `gmail`,
  when `referencesTo` is asked about `gmail`,
  then the place is `trigger.mail.connector` of that routine's file.
- Given nothing names the skill `triage`,
  when `referencesTo` is asked about it,
  then the list is empty.
