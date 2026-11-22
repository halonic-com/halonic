# cloudflare-durable.usage-running

- Status: active
- Since: unreleased
- Source: HAL-16243 (split from HAL-13219); selling layer design, section 3.3, G7 and 13.6

The usage account shall let a run start or wake only while the scope has fewer running runs than its cap and, in an organisation, the member has fewer than their own cap, when they have one; otherwise it shall refuse with how many are running and the cap. Only running runs shall count: a run that waits gives its slot back. Starting a run that already runs shall be allowed again, and a start shall be refused whenever a step would be.

Rationale: one scope, or one member of it, must not take all of a deployment's capacity; a run that waits for an approval or a timer uses none.

## Examples

- Given a cap of 2 with 2 runs running,
  when a third starts,
  then it is refused with 2 running and a cap of 2.
- Given one of them starts waiting,
  when the third starts,
  then it runs, and the waiting run can't wake until a slot is free.
