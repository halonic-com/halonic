# cloudflare-durable.usage-start-check

- Status: active
- Since: unreleased
- Source: HAL-18183 (PR 2 of HAL-18024), the Meter's `check` for `run-start`

The usage account shall answer a check for a run start as a start would be answered, the running runs counted against the scope's and the member's caps, and shall take no slot and write nothing for it. A check for anything else shall not count the running runs.

Rationale: the engine asks the meter whether a run may start before it records the start, and a start that was allowed can still fail before it runs; a check that took a slot would hold the scope at its cap for a run that never ran.

## Examples

- Given a cap of 2 with 2 runs running,
  when a run start is checked,
  then it is refused with 2 running and a cap of 2, and a model call's check is still allowed.
- Given a cap of 2 with 1 run running,
  when a run start is checked twice,
  then both are allowed, and a second run can still start.
