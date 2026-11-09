# memory.knowledge-provider

- Status: active
- Since: 0.1.0
- Source: HAL-181; `KnowledgeProvider` port v1

The memory knowledge source shall hold the documents it is created with, as its own copy, and say their content is the workspace's own (`untrusted` is `false`). Its id shall be `memory` unless set, and it shall search unless created with `search: false`; it never searches semantically or ingests. Search shall count whole words, ignoring case: each time a query word appears in a document's title or content adds one to the score. Hits shall come best first, equal scores ordered by ref, and at most ten unless a limit is set. A hit's snippet shall be up to 80 characters of the content, from the first query word in it, or from the start when only the title matched.

## Examples

- Given documents with `tea` three times, once and once,
  when it is searched for `tea`,
  then the hits score 3, 1 and 1, and the two with 1 come in ref order.
- Given twelve documents that all hold `tea`,
  when it is searched for `tea` without a limit,
  then it gives ten hits.
- Given a document whose title, but not its content, holds `kettle`,
  when it is searched for `kettle`,
  then the hit's snippet is the start of the content.
