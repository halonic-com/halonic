# Decision: bound timer delays and routine intervals

- Approval: [HAL-11239](/HAL/issues/HAL-11239)
- Kind: user-visible

A timer delay (`after`) and a routine interval (`every`) are now a count of
1 to 99999 followed by `m`, `h` or `d`, so the longest is 99999 days, about
273 years. Before, any number of digits was accepted, and a count too large
for a date made the engine throw while it entered a wait state. No real
workflow needs a longer delay. A file with a longer one is now refused with
the same message as any other bad duration.

The three JSON Schema golden files change in the `pattern` of these
durations only.

## Covers

- packages/core/format/spec/routine.schema.json
- packages/core/format/spec/workflow-test.schema.json
- packages/core/format/spec/workflow.schema.json
