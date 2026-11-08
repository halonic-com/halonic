# @halonicjs/testing-contracts

One contract suite per port. Every adapter for a port runs its suite, so all adapters behave the same, whether they keep data in memory, in files or in the cloud (plan 4.3).

- **Layer:** testing
- **Owner:** julian
- **Public API:** `@halonicjs/testing-contracts`

## Rules for the suites

- A suite tests only what the port's doc comments promise. Something only one adapter does is tested in that adapter's package.
- Fixtures, the clock and outbound HTTP are passed in through the suite's `make` function, so the same suite runs in Node and later in `workerd` (plan 4.4).
- No `node:*` imports outside `src/node/`. The package type-checks with the host preset (Web globals only), which makes a Node API a compile error.
- Each suite runs inside `verifies()` with its requirement ID, such as `contracts.blob-store`, so the trace check sees which adapters prove it. The requirements are in `requirements/`.

## Example

```ts
import { blobStoreContract, definitionStoreContract } from "@halonicjs/testing-contracts";
import { MemoryBlobStore, MemoryDefinitionStore } from "./index.ts";

definitionStoreContract("memory", async (files) => new MemoryDefinitionStore(files));
blobStoreContract("memory", async () => new MemoryBlobStore());
```

A read-only adapter, such as a deployed snapshot, runs `definitionSourceContract` instead of `definitionStoreContract`.
