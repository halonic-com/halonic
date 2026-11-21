# engine.start-input-fields

- Status: active
- Since: unreleased
- Source: HAL-14777 (C480 P5, Kim's re-run on HAL-14760, question 16; decided by Liam on HAL-14776)

When the local executor is asked to start a run that isn't a test run, and the run's input lacks a field the workflow's first step reads by name (`gets: [input.<name>]` or `{{input.<name>}}`), it shall record nothing and reject with `InputRefused` `engine.input-missing-field`: "The input has no field <name>, which the step <step> reads." A first step that sends its agent the whole input is not checked, and a test run starts with the input its test gives. A routine started by `halonic routines watch`, `halonic serve` or Studio is refused this way, so it is reported as not started instead of giving its agent nothing.

## Examples

- Given the reply workflow, whose first step `draft` reads `{{input.from}}`, when a run starts with `{}`, then it rejects with "The input has no field from, which the step draft reads." and the run has no log.
- Given the same workflow, when a test run starts with `{}`, then it starts.
