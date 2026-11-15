# Decision: check a real Durable Object alarm live, and run the contract specs live after the test objects are reworked

- Task: HAL-6703 (step 2a of the HAL-198 build plan, ADR 5.9), part 2: Durable Objects and alarms
- Approval: Liam decided the approach in HAL-10413; Liam approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:gKv1rz0MNEl1wmVEZaQy5XTYo8XWgFjUOErrcPntl22tKWKdyetL7qNyXUFZNF6v/e/oZjUVXUcYOweh+PY5Bw==

## What changes

- `testing-cloudflare-live`: `deployAdapterRunner` takes `durableObjects` (binding and class name) and binds them with one `new_sqlite_classes` migration. New `cloudflare-durable/src/test/live-alarm.spec.ts` (a new file in Priya's package; the dependency rules keep workers-types out of this one), bundled into the live test Worker and also run in local workerd (`live-alarm.test.ts`): `LiveRunObject` is the production `RunObject` with a timer listener that records what the alarm delivered in the object's own storage, and one case schedules a timer 3 s ahead and waits up to 45 s for Cloudflare's own alarm to deliver it, once.

## Why

The adapter's contract specs use a fake clock and a map shared with the objects, so they can't run on real Cloudflare (the objects run in their own isolate). HAL-10415 (Priya) reworks them. Until then this case is the only live proof that a real alarm fires the real `RunObject`.

## Not in this part

Running the contract specs live (after HAL-10415 merges). Workers secrets: no adapter exists yet, so nothing is covered. Nothing has run against Cloudflare: the CI account's token isn't set up (HAL-6829, HAL-6708). The case passes in local workerd.

## Tests

Unit test for the binding and migration in `deployAdapterRunner`; the alarm case run in local workerd with the real clock.

## Covers

- cloudflare-live.adapters
