# Decision: the CLI's engine now has harnesses, so cli.local-engine drops "no harnesses"

- Approval: scope decided on HAL-6476, option 1 (Liam); the package owner (Liam) approves this note in review on HAL-7747
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:pzFjzo/xJcHmaA2Ukm4gJdGP4FJjyAkoZw6/RJNggmDXEArVrnigsLXlQ9xMUZ3gDUl6mvkSlDPzRjkl+yxuBw==

## What changes

`cli.local-engine` ended with "In 0.1 the engine shall offer no Halonic tools and no harnesses."
The CLI's engine now gets the harness host (`openLocalHarnessHost`), so the sentence keeps the
part about tools and sends the rest to the new requirement `cli.local-harness-host`. No example
was removed or weakened.

## Why

The sentence would be false once the engine passes `harnesses` and `proposalFolders`. `halonic run`
still refuses an agent that runs in a harness (`cli.run-harness`, `cli.sandbox-gate`) until
HAL-6477, so no person sees a change in behaviour; only the engine's own tests start such a run.

## Covers

- cli.local-engine
