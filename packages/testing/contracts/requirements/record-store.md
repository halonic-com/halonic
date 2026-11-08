# contracts.record-store

- Status: active
- Since: 0.1.0
- Source: HAL-114; plan 4.3; `RecordStore` port v2 (compaction: HAL-719); multi-cloud ADR 5.3

Where an adapter implements `RecordStore`, it shall give every change to a collection, oldest first and exactly as appended, keep collections apart even when one call changes several, give `[]` for an unknown collection, and keep its own copy of the changes. It shall treat a collection name as a value only, so a name such as `../leads` or `leads; DROP TABLE x` is just another collection.

After `compact(collection)`, it shall give one `seed` change per current record of that collection, holding the values `foldRecords` gives, the `at` of the record's last change and no `by`. No overwritten or removed value shall be left in that collection's changes. Changes appended later shall fold onto the seeds as usual, other collections shall stay exactly as they were, and an unknown or empty collection shall stay `[]`. A change appended while a compact runs shall be either folded into the seeds or kept after them, never lost.

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
- Given records `1` (added, then updated), `2` (added, then removed) and `3` (seeded) in `leads`,
  when `leads` is compacted,
  then its changes are one `seed` each for `1` and `3` with their current values, and neither the old value of `1` nor any value of `2` is in them.
- Given a compacted `leads`,
  when an `update` to `1` and an `add` of `4` are appended,
  then folding the changes gives the updated `1`, `3` and `4`.
- Given changes to `leads` and `orders`,
  when `leads` is compacted,
  then the changes of `orders` are exactly as appended, and compacting `unknown` leaves it `[]`.
