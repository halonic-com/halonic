# engine.record-values

- Status: active
- Since: 0.1.0
- Source: HAL-1533, step 4(d) of the HAL-186 plan; the old engine's `checkRecord`

When an agent gives values for a record, the engine shall check each against its collection's field and refuse the record with every problem it found, joined with `; `:

- a field the collection doesn't have: `Unknown field "<key>" (fields: …)`
- a computed field: `"<key>" is computed and cannot be set`
- a required field left out or empty on a new record, or emptied with `null` or `""` by an update: `"<key>" is required`
- a value of the wrong form: `"<key>" must be <what> (got <value>)`. Here `<what>` is a number, `at least <min>`, `at most <max>`, a date YYYY-MM-DD, a month YYYY-MM, `one of <values>`, or true or false. A date or month must also be on the calendar, so `2026-02-30` and `2026-13` are refused.

The engine shall bring a value into its field's form where the meaning is clear:

- a number written as text, with a decimal comma or a currency sign, becomes a number. Text with no number left after the sign, such as `"€"`, is refused, and so is a comma before exactly three digits, such as `"1,234"`, because it may mean 1234 or 1.234
- a money amount is rounded to cents
- `"true"` and `"false"` become booleans
- any other value of a text or reference field becomes its JSON text

A new record shall get each field's default when the value is left out. An update shall change only the fields it names, and may leave required fields out.

## Examples

- Given a money field `amount` and the value `"€ 12,5"`,
  when the record is checked,
  then `amount` is `12.5`.
- Given a choice field `status` with values `open` and `paid`,
  when a record with `status: "lost"` is checked,
  then it is refused with `"status" must be one of open, paid (got "lost")`.
