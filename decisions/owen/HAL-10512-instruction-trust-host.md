# Decision: the CLI's harness host checks instruction trust, with a time limit

- Task: HAL-3106 slice 3d (HAL-10512)
- Approval: HAL-10213 (Liam's decision on the instruction trust check); the signature is Liam's, on HAL-10512
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:KWKr0CvU3IA41mAAYjL0lq+0gwLod+oiBZWBHiBsn09Av909n3Gb44wHrZWsoY++fcW1er1TjG7qtuCJiocGDA==

## What changes

The CLI's harness host now gives the engine an `InstructionTrustService` over the profile's `instruction-trust` folder, so a harness run whose instructions changed since a person trusted them, or that nobody trusted, is refused before its program starts. `harnessHostOf` passes the check on as it is. The check has a time limit, a third start limit named `trust` (10 seconds by default): a check that hasn't answered in time, or that throws, refuses the start.

Four active requirements are edited, and nothing is weakened: each gets a sentence and an example, and no test was removed or made weaker.

- `engine.harness-instructions-trust`: the time limit and the closed refusal.
- `engine.harness-start-limits`: the third limit and its default.
- `harness-host.builder`: the check is passed on unchanged.
- `cli.local-harness-host`: the check is wired, and the program is given the pinned text.

## Tests

New cases for each: a check that hangs, a check that throws, the check passed on by the builder, a changed pin, an untrusted agent, and the text the program is given. Tests that already ran harness agents in the CLI now trust the coder's instructions first, as a person would.

## Covers

- engine.harness-instructions-trust
- engine.harness-start-limits
- harness-host.builder
- cli.local-harness-host
- cli.commands.serve.harness
