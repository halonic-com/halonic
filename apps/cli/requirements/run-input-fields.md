# cli.run-input-fields

- Status: active
- Since: unreleased
- Source: HAL-14267 (C337 C9 (c), Nina's check on HAL-14257, row 2; decided by Liam on the task)

When the run's input, from `--input` or `{}` without it, lacks a field the workflow's first step reads by name (`gets: [input.<name>]` or `{{input.<name>}}`), `halonic run` shall start nothing and fail with `invalid_input` (exit 2): "Couldn't run <workflow>: the input has no field <name>, which the step <step> reads." followed by the fields the input has, "Your input has no fields." or "You gave no --input.", and the fix "Pass a JSON object with <name>, in a file or as text, such as --input input.json." A first step that sends its agent the whole input is not checked.

## Examples

- Given the Acme example and `--input '{"email": "Hi"}'`,
  when `halonic run support-reply` runs,
  then it says "✕ Couldn't run support-reply: the input has no field mail, which the step Read the email reads. Your input has: email.", starts no run and exits 2.
- Given no `--input`,
  when the same command runs,
  then the reason ends "You gave no --input." and it exits 2.
