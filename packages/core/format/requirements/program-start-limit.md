# format.program-start-limit

- Status: active
- Since: unreleased
- Source: HAL-16339

The format shall count how much text reading a program start for the paths it names (`format.program-start-paths`) takes: the length of the whole text after each `=`, `:` and `@` of its arguments and `env` values, together, without building those texts. When that is more than 4,000,000 characters, reading the start shall fail with an `invalid_input` error, so every guard that reads it refuses the start rather than read less of it, and `parseFile` shall refuse a connector whose local program start holds that much with the error `start-too-long-to-check` at `transport.stdio`. A text is never cut short or read in part.

## Examples

- Given the argument `a=b:c`,
  when its reading size is counted,
  then it is 4: `b:c` and `c`.
- Given a connector whose program has one argument of 4,000 `:`,
  when it is parsed,
  then it fails with `start-too-long-to-check`, and reading its start for paths throws `invalid_input`.
- Given a connector whose program has the argument `--config=tools/mail.json`,
  when it is parsed,
  then it passes.
