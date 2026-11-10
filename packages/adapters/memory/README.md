# @halonicjs/adapter-memory

In-memory implementations of the ports, for tests, the `core/app` kernel tests, the browser demo and the parity harness. They pass the same contract suites (`@halonicjs/testing-contracts`) as every other adapter, so a test that passes in memory means the same thing elsewhere.

- **Layer:** adapters
- **Owner:** julian
- **Public API:** `@halonicjs/adapter-memory`
- **Runtime:** any (`"runtime": "any"` in `package.json`): Web globals only, no Node APIs, so it runs in Node, the browser and `workerd`.

## Pinned connector launches

`MemoryConnectorFactory` starts a `stdio` connector with a pin the way a real launcher does
(`contracts.connector-pin`): the launch must pass `app.package-runner-launch`, and the pin's registry
must list the pinned version, asked at `registryUrl` only. What it then spawns, which
`MemoryConnectorFactory.launches()` records, has the runner's words rewritten by `pinnedRunnerArgs`
from `@halonicjs/app`, the same function the real MCP launcher uses. So a bare package option is
pinned too: `npm exec --package=mail-mcp -- mail-mcp` starts with `--package=mail-mcp@2.3.1`, and the
same holds for `npx -p`, `uvx --from` and `pipx run --spec`, not only for a positional package
name. Variables that `app.package-runner-launch` blocks are dropped from the inherited environment,
and the registry is set from `registryUrl`.

## Example

Files, blobs, a timer and a lease, all in memory. The code lives in
[`examples/workspace-timers-and-leases.ts`](examples/workspace-timers-and-leases.ts), where it is
typechecked and run by `src/example.test.ts`; keep this copy in step with it. The file imports
`../src/index.ts`, because a package may not import itself by name; outside this package, import
`@halonicjs/adapter-memory` as below.

```ts
import {
  ManualClock,
  MemoryBlobStore,
  MemoryCoordination,
  MemoryDefinitionStore,
  MemoryScheduler,
} from "@halonicjs/adapter-memory";

/** Stores files and blobs, fires a timer and shares a lease, all in memory and on a clock that only moves when told. */
export async function runExample(): Promise<{
  files: string[];
  blobText: string;
  firedBefore: string[];
  firedAfter: string[];
  firstLease: boolean;
  secondLease: boolean;
  leaseAfterExpiry: boolean;
}> {
  // Workspace files live in a map; `list` gives public paths in order.
  const definitions = new MemoryDefinitionStore({ "workspace.yaml": "id: acme\n" }, "memory:demo");
  await definitions.write("hubs/a/hub.yaml", "id: a\n");
  const files = await definitions.list(); // ["hubs/a/hub.yaml", "workspace.yaml"]

  // Blobs are addressed by the hash of their bytes.
  const blobs = new MemoryBlobStore();
  const ref = await blobs.put(new TextEncoder().encode("hello"), "text/plain");
  const bytes = await blobs.get(ref.hash);
  const blobText = new TextDecoder().decode(bytes ?? new Uint8Array()); // "hello"

  // The clock moves only when told, so a test makes time pass without waiting.
  const clock = new ManualClock("2026-01-01T00:00:00.000Z");

  // Nothing runs on its own: the scheduler delivers due timers when `runDue` is called.
  const fired: string[] = [];
  const scheduler = new MemoryScheduler(
    {
      onTimer: async (timer) => {
        fired.push(timer.timerId);
      },
      onTick: async () => {},
    },
    clock,
  );
  await scheduler.schedule("run_1", "wake-up", "2026-01-01T00:30:00.000Z");
  await scheduler.runDue();
  const firedBefore = [...fired]; // []: the timer is not due yet
  clock.advance(30 * 60_000);
  await scheduler.runDue();
  const firedAfter = [...fired]; // ["wake-up"]

  // A lease is held until it is released or its time runs out.
  const coordination = new MemoryCoordination(clock);
  const first = await coordination.tryAcquire("routine:daily", 60_000);
  const second = await coordination.tryAcquire("routine:daily", 60_000); // null: still held
  clock.advance(60_000);
  const third = await coordination.tryAcquire("routine:daily", 60_000); // a new lease: the first ran out

  return {
    files,
    blobText,
    firedBefore,
    firedAfter,
    firstLease: first !== null,
    secondLease: second !== null,
    leaseAfterExpiry: third !== null,
  };
}
```
