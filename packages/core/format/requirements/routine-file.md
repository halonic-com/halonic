# format.routine-file

- Status: active
- Since: 0.1.0
- Source: HAL-113 (plan 4.2, 7.3, 9.3), ported from 784f78d `packages/core/schema/src/index.ts`

When `parseFile` reads a routine file, the format shall accept the old `Routine` schema: one trigger (schedule, every, manual, signal or mail) and one target (a workflow with input, or an agent with a prompt), `enabled: true`, `overlap: skip` and `catchUp: last` by default. Checking cron text and time zones is `@halonicjs/routines`'.

## Examples

- Given `trigger: { every: 1h }` and `run: { workflow: invoice }`, when it is parsed, then the defaults are filled in and the input is `{}`.
- Given `trigger: { every: 15 }`, when it is parsed, then it fails with `invalid_union` at `trigger`.
- Given `run: { hub: billing }`, when it is parsed, then it fails with `invalid_union` at `run`.
