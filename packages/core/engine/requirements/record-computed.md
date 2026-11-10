# engine.record-computed

- Status: active
- Since: 0.1.0
- Source: HAL-1533, step 4(d) of the HAL-186 plan; the old engine's `evaluate`

When the engine reads a collection's records, it shall work out each computed field from the record's stored values with the field's formula. A formula is made of numbers, field names, `+ - * /` and parentheses. A computed money field shall be rounded to cents. When a field the formula names is empty or not a number, or the formula divides by zero, the computed value shall be `null`. When the formula isn't well formed, the computed value shall be `null` too: it has another character such as `%` or `^`, a `(` without its `)`, or a part that is left over, such as `amount sharePct`. The engine shall read the formula itself and never run it as code.

## Examples

- Given a money field `share` computed as `amount * sharePct / 100`, and a record with `amount: 99.99` and `sharePct: 33`,
  when the records are read,
  then `share` is `33`.
- Given the same record without `sharePct`,
  when the records are read,
  then `share` is `null`.
- Given a money field computed as `amount * 19%`,
  when the records are read,
  then the field is `null`.
