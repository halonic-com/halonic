# Decision: ConfigMeter counts a run's end recorded twice once

- Task: HAL-18110 (found while writing the Meter contract suite, HAL-18024)
- Approval: Liam chose this fix on HAL-18110 (option 1: keep the ids of recently ended runs in the ledger); Liam signs this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:x06Mupc/SmUEOpkaqXbj1uo2xta1qQEtd8TpH//kpQsZYJwC+Selinwn0cdnpgLF8JI2jgSkOGaKuBKH/y7AAg==

## What changes

- `engine.config-meter`: `record` counts a run's end recorded again as nothing, while the meter
  still keeps that run's id. The ledger keeps the ids of the scope's ended runs for two days (as
  long as a hold lasts) and within 8 KiB, newest first. The id and the count change in the same
  `compareAndSet`. A ledger stored before this change, without the ids, still reads. Two examples
  are added. The test that recorded one run's end twice to stand for two runs now records two
  runs; no test or example is weakened.
- The 8 KiB comes out of the part of the 64 KiB value that holds use, not the counters' 32 KiB, so
  a scope can hold about 220 steps at once instead of about 290.

## Why

The engine can't promise one `record` per run end: an answer lost after a successful
`compareAndSet` is tried again, and two hosts can both end the same run (the sweep of lost runs,
the unfinished-effects path). A separate key per run can't change together with the count, and
`Coordination` values never expire, so the ids live in the ledger, bounded by time and bytes.

## Covers

- engine.config-meter
