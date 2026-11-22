# cloudflare-durable.usage-outbox

- Status: active
- Since: unreleased
- Source: HAL-16243 (split from HAL-13219); selling layer design, sections 4.4 and 4.5

The usage account shall write each usage record together with an outbox row for Cloud in the same transaction. A record and its row shall hold only ids, an enum, whole numbers and a time, so no text from a run reaches them; an id that isn't a machine id or a unit the account doesn't count shall be refused before anything is stored. The account shall add a row the first time in a period the pool reaches 80% and 100% of a limit. At the outbox's cap it shall add one warning row and refuse new checks and reservations, while settles and records still add their rows.

Rationale: a charge must never be kept without what tells Cloud about it, and a crash must not split them; usage rows leave the deployment, so they must not carry a run's content; a full outbox means Cloud isn't receiving usage, so no new work starts that couldn't be billed, but work already done is never dropped.

## Examples

- Given a record whose owner carries an extra text field,
  when it is charged,
  then that text is nowhere in storage.
- Given an outbox cap of 2 that is reached,
  when a step asks to reserve,
  then it is refused and one warning row is in the outbox.
