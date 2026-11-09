# contracts.knowledge-provider

- Status: active
- Since: 0.1.0
- Source: HAL-181; `KnowledgeProvider` port v1

Where an adapter implements `KnowledgeProvider`, it shall have an id, say whether it searches and have `list` exactly as its binding declares, and offer semantic search only as a kind of search. `get` shall give back each document it holds with its ref, title and content, and `null` for any ref that names no document, including refs that point outside the source, such as `../private.md`, absolute paths, encoded `..`, or a `..` that leads back to a document it holds. It shall keep its documents, whatever the caller does with what it got. Where it searches, a word only one document has shall find that document first; hits shall come best first by score, each document at most once, never more than `limit`, and only documents it holds, so nothing outside the source is found; a source that doesn't search semantically shall find nothing for a word none of its documents has, and a source with no documents shall find nothing. Where it lists, `list` shall give every document's ref and title once, and nothing outside the source.

## Examples

- Given a source holding `guides/invoices.md`, and a file `../private.md` beside it,
  when `get("../private.md")` is called,
  then it gives `null`.
- Given a source that searches,
  when it is searched for `bookkeeper`, a word only `guides/invoices.md` has,
  then that document is the first hit.
- Given a search that matches three documents,
  when it is made with `limit: 1`,
  then it gives one hit.
