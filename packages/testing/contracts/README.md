# @halonicjs/testing-contracts

One contract suite per port. Every adapter for a port runs its suite, so all adapters behave the same, whether they keep data in memory, in files or in the cloud (plan 4.3).

- **Layer:** testing
- **Owner:** julian
- **Public API:** `@halonicjs/testing-contracts`, and `@halonicjs/testing-contracts/node` for bindings whose tests run in Node

## Rules for the suites

- A suite tests only what the port's doc comments promise. Something only one adapter does is tested in that adapter's package.
- Fixtures, the clock and outbound HTTP are passed in through the suite's `make` function, so the same suite runs in Node and later in `workerd` (plan 4.4).
- No `node:*` imports outside `src/node/`. The package type-checks with the host preset (Web globals only), which makes a Node API a compile error. `src/node/` type-checks with the Node preset (`tsconfig.node.json`).
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

## Node bindings: no real connections

A binding whose tests run in Node calls `refuseRealConnections()` from
`@halonicjs/testing-contracts/node` at the top of its test file, next to its suites. Any case that
then opens a TCP connection to another machine fails, also when the binding catches the error. The
trap sits on `net.Socket.prototype.connect`, so it also sees `https.get`, Node's `fetch` and vendor
SDKs. Connections to `localhost`, `127.x.x.x`, `::1` and local socket paths go through, so a
binding can still start a local test server.

```ts
import { refuseRealConnections } from "@halonicjs/testing-contracts/node";

refuseRealConnections();
connectorClientContract("google", "google", makeGoogleConnector);
```

A read-only adapter, such as a deployed snapshot, runs `definitionSourceContract` instead of `definitionStoreContract`.
