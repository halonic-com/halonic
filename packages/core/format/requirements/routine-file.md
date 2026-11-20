# format.routine-file

- Status: active
- Since: 0.1.0
- Source: HAL-113 (plan 4.2, 7.3, 9.3), ported from 784f78d `packages/core/schema/src/index.ts`; the message for a bare number, HAL-12607; the message for a trigger of no kind, HAL-14299

When `parseFile` reads a routine file, the format shall accept the old `Routine` schema: one trigger (schedule, every, manual, signal or mail) and one target (a workflow with input, or an agent with a prompt), `enabled: true`, `overlap: skip` and `catchUp: last` by default. An interval written as a bare number, such as `every: 15`, shall fail at the interval with the message for a count without a unit, as the text `"15"` does; the old schema failed the whole trigger with `invalid_union`, which named no reason. This is an allowed difference: the file fails either way. A trigger that is none of the kinds, such as two kinds at once or `manual: false`, shall fail with `invalid_union` at `trigger` and the message `trigger needs exactly one of: schedule, every, manual: true, signal, mail or webhook.` Checking cron text and time zones is `@halonicjs/routines`'.

## Examples

- Given `trigger: { every: 1h }` and `run: { workflow: invoice }`, when it is parsed, then the defaults are filled in and the input is `{}`.
- Given `trigger: { every: 15 }`, when it is parsed, then it fails with `invalid_format` at `trigger.every` and the message `use a number and a unit, e.g. "15m", "1h", "1d" (runs are placed from midnight UTC)`.
- Given `run: { hub: billing }`, when it is parsed, then it fails with `invalid_union` at `run`.
- Given `trigger: { schedule: '0 9 * * 1', every: 1h }`, or `trigger: { manual: false }`, when it is parsed, then it fails with `invalid_union` at `trigger` and the message `trigger needs exactly one of: schedule, every, manual: true, signal, mail or webhook.`
