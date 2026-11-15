# Decision: run the Durable Object contract specs in the live test Worker

- Task: HAL-6703 (step 2a of the HAL-198 build plan, ADR 5.9), part 3: the Durable Object contract specs
- Approval: Liam decided the approach in HAL-10413; Liam approves this note in review
- Kind: internal

## What changes

- `testing-cloudflare-live`: `live/adapters.live.test.ts` also bundles the coordination, run store, run watch and scheduler specs of `cloudflare-durable`, and binds their objects: `COORDINATION` (`TestCoordinationObject`), `RUNS` (`TestRunObject`) and `ROUTINES` (`TestRoutinesObject`), next to `LIVE_RUNS`. The existing migration creates all four classes. D1 `DB` is already bound for the run store spec.

## Why

HAL-10415 (merged) moved the clock, listener and run list out of the suite's isolate, so the specs no longer depend on shared memory and can run where every object has an isolate of its own. This is the contract coverage the live runner was waiting for.

## Not in this part

The `class-names` spec stays local: it checks export names, not platform behaviour. Workers secrets: no adapter exists yet. Nothing has run against Cloudflare: the CI account's token isn't set up (HAL-6829, HAL-6708).

## Tests

The five specs bundle into one Worker script that exports all four classes (checked locally); `pnpm check` passes. The specs themselves already pass in local workerd.

## Covers

- cloudflare-live.adapters
