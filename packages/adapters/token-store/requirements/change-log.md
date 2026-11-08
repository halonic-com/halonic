# token-store.change-log

- Status: active
- Since: 0.1.0
- Source: HAL-620 (Liam's review on HAL-625)

The token store shall keep tokens in the record store collection `_tokens`, a name no workspace collection can have, appending `add`, `update` and `remove` changes stamped by the clock, and shall fold `seed` like `add` and `update` by merging values.

## Examples

- Given a token set twice and then removed,
  when the log is read,
  then it holds `add`, `update` and `remove` for the canonical name in `_tokens`, each with the clock's time.
- Given a seeded record,
  when the token is read,
  then the store opens it like an added one.
