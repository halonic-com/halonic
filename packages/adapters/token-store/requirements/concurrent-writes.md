# token-store.concurrent-writes

- Status: active
- Since: unreleased
- Source: HAL-16340

When the record store refuses the compaction after a replace or a remove, the token store shall compact again, up to three tries in all, and the replace or remove shall resolve once a try succeeds. It shall reject only when every try failed; its change is stored then.

Rationale: a record store may refuse a compaction because another one finished first, as D1 does when two writes reach it at the same time. The change was already stored, so rejecting would tell the caller it failed when it didn't, and the old sealed value would stay until the next write.

## Examples

- Given a token that is set, when it is set again and the first compaction is refused because another one finished first, then the set resolves, the new value is read back and the old sealed value is in none of the changes.
- Given the same for a remove, then the remove resolves and the token is gone.
- Given a record store that refuses every compaction, when a token is replaced, then the set rejects with the store's error after three tries, and the new value is read back.
