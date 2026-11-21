# Decision: the Coordination contract runs once, over the real coordination objects

- Task: HAL-13336
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-13336 (the task asks to move adapter-cloudflare-durable's Node tests into workerd and drop their fakes; Liam agreed on 19 Nov that this note comes with part 3 and signs it in review on the task)
- Kind: internal

## What changes

`packages/adapters/cloudflare-durable/src/state-contract.test.ts` is deleted, and
`packages/adapters/cloudflare-durable/src/durable-coordination.test.ts` runs 3 tests where it ran 16.
Both ran the shared Coordination contract (`coordinationContract`, 13 tests) over `FakeStateStorage`
and `ManualClock` in Node: once over `CoordinationState` directly, and once through
`DurableCoordination` over a namespace of fake objects. This pull request deletes those fakes.

The contract still runs in full, once, in workerd: `coordination.test.ts` runs it through
`DurableCoordination` against real `TestCoordinationObject`s and their real storage, the same run
that `pnpm test:live` makes on a real Cloudflare account. The three `DurableCoordination` tests that
didn't come from the contract (a fresh stub per call, the object names) moved into workerd with
their names and checks. So in this package `contracts.coordination` goes from 39 tests to 13: the
same 13 checks, run once instead of three times. Across the repository it goes from 52 tests to 26
(and from 364 `expect` calls to 182), because the other adapters' runs of the contract don't change.
No other requirement or test file loses a test.

The package now runs 152 tests, all but the two of `napFor` in workerd. Coverage from that run is
99.3% of lines and 93.6% of branches, over its floor of 90% / 85%.

## Why

The two Node runs checked the contract against stand-ins for Durable Object storage and time, and a
stand-in can differ from the real storage in ways the tests can't see. The workerd run checks the
code the adapter ships, against the storage it ships on, so the extra runs only added fakes to keep
in step.

## Covers

- contracts.coordination
- packages/adapters/cloudflare-durable/src/state-contract.test.ts
- packages/adapters/cloudflare-durable/src/durable-coordination.test.ts
