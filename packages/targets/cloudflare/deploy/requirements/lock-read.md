# deploy.lock-read

- Status: active
- Since: unreleased
- Source: HAL-6702; build plan, the target's `deployTarget` export; deploy flow 3.7 and 5.1 (HAL-6687)

The target shall read who holds the deploy lock without taking, renewing or creating it, so `status` and `plan` can name the holder and change nothing (`deploy.lock`). The read shall count a lease as held only until it runs out by the database's clock, and shall find no holder when the database or its lock table doesn't exist yet. `status` shall give the holder in the port's shape: who, when it started and when it runs out.

Rationale: a deploy that is already running must be named before anything is asked (flow 3.7), and a read that wrote would make `status` change the host.

## Examples

- Given a lease held by kim@example.com that hasn't run out, when `status` is called, then its `lockedBy` names kim@example.com with the start and end times, and no lock call writes.
- Given a lease that ran out, when `status` is called, then `lockedBy` is empty.
- Given a database no deploy has locked yet, when the lock is read, then no holder is found and no table is created.
