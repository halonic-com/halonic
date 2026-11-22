# cloudflare-durable.usage-running

- Status: active
- Since: unreleased
- Source: HAL-16243 (split from HAL-13219), HAL-16281 (the lease); selling layer design, section 3.3, G7 and 13.6

The usage account shall let a run start or wake only while the scope has fewer running runs than its cap and, in an organisation, the member has fewer than their own cap, when they have one; otherwise it shall refuse with how many are running and the cap. Only running runs shall count: a run that waits gives its slot back. Starting a run that already runs shall be allowed again, and a start shall be refused whenever a step would be.

A run shall hold its slot for a lease, which each start or renewal begins again. A slot whose lease has ended shall not count, and the account's sweep shall free it and answer when the next lease ends. A run that renews after its lease ended shall take a new slot only while the cap has room, and be refused otherwise.

Rationale: one scope, or one member of it, must not take all of a deployment's capacity; a run that waits for an approval or a timer uses none. A run that is lost (its worker died, its stop never came) must not hold the scope at its cap for good.

## Examples

- Given a cap of 2 with 2 runs running,
  when a third starts,
  then it is refused with 2 running and a cap of 2.
- Given one of them starts waiting,
  when the third starts,
  then it runs, and the waiting run can't wake until a slot is free.
- Given a cap of 2 with 2 runs running and one of them lost,
  when its lease ends,
  then a third run starts, and the lost run, if it comes back and renews, is refused.
