# Decision: the runner bridge answers every request and caps a request's head at 32 KiB

- Approval: the attack tests on [HAL-4338](/HAL/issues/HAL-4338) (section F1) asked for this on [HAL-4354](/HAL/issues/HAL-4354); the package owner (Liam) approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:IJt7bSgIrpir220zyejCwOvOQnDak7HCIrbX6yHLKdvSWVEd2W3yxymyKCO6EcX5abL/JDP8d9vEy4hf3W6WDA==
- Task: HAL-4354

## What changes

`integration-runner.requests` gains two promises and two examples:

- a request whose URL, headers and secret placements come to more than 32 KiB together fails with
  `request-too-large` and never reaches the kit;
- a kit refusal whose message is too large for a frame is still answered, with the same code and a
  short fixed message, and Halonic keeps running.

Every existing promise and example stays as it was. No example was removed or weakened.

## Why

A hostile runner could send one full frame naming a secret of almost 1 MiB. The kit's refusal
repeats that name, so the error frame grew over 1 MiB, writing it threw inside a promise nobody
awaited, and in a host with Node's default that ends Studio or the CLI. The 32 KiB cap is the one
design HAL-958 section 3.3 already sets for a request's head; the bridge didn't enforce it yet.
This hardens behaviour inside the agreed design, so the note is internal.

## Covers

- integration-runner.requests
- packages/adapters/integration-runner/src/halonic/request-size.test.ts
