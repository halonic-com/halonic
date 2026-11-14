# Decision: adapter-cloudflare-durable gets a testing entry point

- Approval: HAL-6803 (Liam, CTO)
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:jskA7VKljOImCzUBt/G0D5iiymrR1T4jIu4b3MR3S/n/c5Cgh/HnGmHlvtfvGEp66e27WQ8hyQkWt75CUeO3Bg==

`@halonicjs/adapter-cloudflare-durable` adds `./testing` to its `exports` (`extraExports` in
`tooling/check/policy.json`), as `adapter-git` has. It holds the Durable Object classes whose clock
a suite moves (`TestCoordinationObject`, `TestRunObject`, `TestRoutinesObject`) and the clock and
registry they read.

## Why

The adapter's own scheduler and coordination specs and the Worker's target contract suite (HAL-6803)
both run those contracts against the real Durable Objects, with time under the suite's control.
Without the entry point the Worker's package would copy about 130 lines of test objects. The entry
is for test code only: it imports nothing from `testing-contracts` and no runtime package imports it.

## Covers

- tooling/check/policy.json
