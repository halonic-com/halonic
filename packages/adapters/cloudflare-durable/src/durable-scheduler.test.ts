import { runSuitesInWorkerd } from "@halonicjs/target-cloudflare-testing";
import { verifies } from "@halonicjs/testing-spec";

// The scheduler against the real run objects, inside workerd.
await runSuitesInWorkerd([new URL("./test/durable-scheduler.spec.ts", import.meta.url)], {
  durableObjects: { RUNS: "TestRunObject" },
  wrap: (register) => verifies("cloudflare-durable.timers", register),
});
