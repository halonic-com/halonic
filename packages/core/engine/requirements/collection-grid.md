# engine.collection-grid

- Status: active
- Since: unreleased
- Source: HAL-1303, P7; flow-library 5.3; `library.collections.edit-cell`, `library.collections.add-row-when-ready`, `library.collections.views-with-totals`

When the collection page shows a collection, `collectionGrid` shall return its columns in file order (name, type, required, computed, choices), a chip for "All" and one per view with the record count and, where the view names a `total` field, the total, and the rows of the chosen view. `editCell` shall return the change for text typed into one cell: empty text empties the field (`null`), other text is checked like an agent's value, and a computed or unknown field or a value the field doesn't accept returns the core message and no change. `newRow` shall return the new row's draft with the defaults of empty fields, the required fields still empty after the defaults in file order, and, only when none is still needed and every value is accepted, the record to add; otherwise the first message.

## Examples

- Given a view `open` with `total: share` and one open record, then the chips are "All" with 1 and `open` with 1 and total 45.
- Given the view `open` chosen, then only its records are the rows.
- Given "65" typed into `amount`, then the change is `amount: 65`.
- Given empty text typed into an optional field, then the change sets it to `null`.
- Given "lots" typed into a money field, then there is no change and the message names the field.
- Given a computed field, then no change is made.
- Given only `what` typed into the new row, then `amount` is still needed and `sharePct` (default 100) is prefilled and not listed.
- Given `what` and `amount` typed, then the record has both and the default.
