# cloudflare-durable.usage-erase

- Status: active
- Since: unreleased
- Source: HAL-18015 (part of HAL-13219); selling layer design, sections 4.4 and 4.5

When a scope is deleted, the usage object shall erase its storage and its alarm only when no outbox row waits to go to Cloud. With rows waiting it shall erase nothing and answer how many wait. Asking it shall not note a scope in an object that has none, and a scope other than the object's name shall be refused. Erasing an empty or already erased object shall be safe.

Rationale: an outbox row is what bills use already made; wiping it with the scope would lose that use for good. Until Cloud receives the rows, the delete waits and is run again.

## Examples

- Given an object of `u/acme` with two rows waiting,
  when it is asked to erase,
  then it answers 2 and both rows are still there.
- Given an object that was never used,
  when it is asked to erase,
  then it answers 0 and stores nothing.
