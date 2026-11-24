# runtime.two-scope

- Status: active
- Since: unreleased
- Source: selling layer S1-4 (HAL-13216, HAL-12478)

The runtime a scope's request is served with shall keep every part that holds data to that scope: what one scope writes to its run store, run events, run list, timers, watchdog, routines object, blobs, records, sign-in tokens or coordination (leases, values, counters and windows) shall never be read, listed, found, delivered, counted, woken or changed through another scope's runtime on the same bindings. The clock, the deployment's secrets, the deployment's definitions and the password hasher are the only shared parts. A part added to the runtime shall get its own case or a stated reason before the test passes.

Rationale: a scope is the unit that owns stored data, a person's `u/<id>` or an organisation's `o/<id>`. One check per store against the real adapters catches a store that drops the scope, including one added later, before a customer's data reaches another customer.

## Examples

- Given two people whose scope ids differ by one letter at the end, a person and an organisation whose ids end alike, or two such organisations, when one scope stores a run under an id, then the other scope's run store, run list and live events don't have it, and storing a run of the same id there leaves the first run's events as they were.
- Given the same pairs, when one scope sets a timer, a lease, a value, a counter or a window under a key, then the other scope sees none of it, and its own writes under that key leave the first scope's as they were.
- Given the same pairs, when one scope stores a blob, a record or a sign-in token, then the other scope doesn't find it, and writing, compacting or removing the same hash, record id or token name there leaves the first scope's as it was.
- Given a stuck run in one scope, when the other scope's watchdog sweeps, then it wakes nothing, and the first scope's watchdog wakes the run.
- Given a runtime that gains a part the test doesn't name, then the test fails.
