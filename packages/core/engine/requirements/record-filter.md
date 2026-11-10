# engine.record-filter

- Status: active
- Since: 0.1.0
- Source: HAL-1533, step 4(d) of the HAL-186 plan; the old engine's `filterRecords` and `viewRecords`

When records are filtered by a `where`, the engine shall keep the records that match every condition in it. A condition is one of these:

- a value the field must equal
- a list of values the field must equal one of
- `null` for an empty field
- an object of `gt`, `gte`, `lt`, `lte` and `not`

Numbers compare as numbers, and other values, such as dates, as text by character code, so the order doesn't depend on the machine's language. When records are sorted by a field, empty values come first, then the rest in that order. The value `"today"` stands for today's date. The key `id` matches the record's id.

When records are read through one of the collection's named views, the engine shall apply the view's `where` and `sort`. When the view names a `total` field, the engine shall also give the sum of that field over the view's records, rounded to cents.

## Examples

- Given invoices due on `2026-11-01` and `2026-12-01`, and today `2026-11-10`,
  when they are filtered with `due: { lt: "today" }`,
  then only the first is kept.
- Given a view `open` with `where: { status: open }` and `total: amount`,
  when the records are read through it,
  then the open invoices come back with the sum of their amounts.
- Given amounts `12.5`, `12.25`, `-5` and `-10`,
  when the records are sorted by amount,
  then they come back as `-10`, `-5`, `12.25`, `12.5`.
