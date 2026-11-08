# contracts.record-store

- Status: active
- Since: 0.1.0
- Source: HAL-114; plan 4.3; `RecordStore` port v1; multi-cloud ADR 5.3

Every `RecordStore` adapter shall give every change to a collection, oldest first and exactly as appended, keep collections apart even when one call changes several, give `[]` for an unknown collection, and keep its own copy of the changes. It shall treat a collection name as a value only, so a name such as `../leads` or `leads; DROP TABLE x` is just another collection.

## Examples

- Given changes `add`, `update` and `remove` to `leads` in two calls,
  when the changes of `leads` are read,
  then they come back in that order with their `by` fields.
- Given one call with changes to `orders` and `leads`,
  when `orders` is read,
  then only the `orders` changes come back.
- Given a change to collection `../leads`,
  when `leads` is read,
  then it gives `[]`.
