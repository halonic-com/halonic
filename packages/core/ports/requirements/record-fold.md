# ports.record-fold

- Status: active
- Since: 0.1.0
- Source: HAL-719, from the security review in HAL-705 (plan D1); `RecordStore` port v2

The ports package shall have one way to fold record changes into the current records, `foldRecords`, so that readers and `RecordStore.compact` agree. Taking changes oldest first, `add` and `seed` shall set all of a record's values, `update` shall merge its values into the record's current values, and `remove` shall drop the record. Each current record shall carry the `at` of its last change. `compactedChanges` shall turn the folded records into one `seed` change each, with that `at` and no `by`, for adapters to store when they compact.

## Examples

- Given `add` `{ name: "Ada", city: "London" }` then `update` `{ name: "Ada L." }` to record `1`,
  when the changes are folded,
  then record `1` has `{ name: "Ada L.", city: "London" }` and the `at` of the update.
- Given `add`, `remove` and `add` again to record `1`,
  when the changes are folded,
  then record `1` has only the values of the last `add`.
- Given a `seed` to record `2` and a `remove` of it,
  when the changes are folded,
  then there is no record `2`.
- Given `add` with `by` and `update` to record `1`,
  when the changes are compacted,
  then they become one `seed` for record `1` with the merged values, the `at` of the update and no `by`.
