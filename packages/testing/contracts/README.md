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

Run the clock and id-generator suites against the two `@halonicjs/std` adapters. The code lives in
[`examples/run-a-contract-suite.ts`](examples/run-a-contract-suite.ts), where it is typechecked and
run by `src/example.test.ts`; keep this copy in step with it. The file imports `../src/index.ts`,
because a package may not import itself by name; outside this package, import
`@halonicjs/testing-contracts` as below. The memory adapter's own suites are in
[`adapters/memory`](../../adapters/memory/src/memory.test.ts): it cannot be used here, because it
already uses this package in its tests and the two would depend on each other.

```ts
import { fixedClock, fixedIds } from "@halonicjs/std";
import { clockContract, idGeneratorContract } from "@halonicjs/testing-contracts";

/**
 * Registers a contract suite for each of two adapters and names them. Call it
 * at the top level of a `*.test.ts` file: each suite adds its cases to the
 * test run there, so an adapter that breaks its port's promises fails the run.
 */
export function runExample(): string[] {
  // `make` builds a fresh adapter for every case; any setup it needs, such as a clock, goes in here.
  clockContract("std fixedClock", async () => fixedClock());
  idGeneratorContract("std fixedIds", async () => fixedIds());
  return ["Clock contract: std fixedClock", "IdGenerator contract: std fixedIds"];
}
```

An adapter package registers its suites the same way from a `*.test.ts` file, for example
`definitionStoreContract("memory", async (files) => new MemoryDefinitionStore(files))`.

A read-only adapter, such as a deployed snapshot, runs `definitionSourceContract` instead of `definitionStoreContract`.
