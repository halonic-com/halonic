import { runSuitesInWorkerd } from "@halonicjs/target-cloudflare-testing";
import { verifies } from "@halonicjs/testing-spec";

// The run object over a real Durable Object's state, inside workerd.
await runSuitesInWorkerd([new URL("./test/run-object.spec.ts", import.meta.url)], {
  durableObjects: { STATE_HOST: "StateHostObject" },
  wrap: (register) => verifies("cloudflare-durable.run-log", register),
});

// Failed run list updates, reported by the run state and logged by the run object.
await runSuitesInWorkerd([new URL("./test/run-list-failures.spec.ts", import.meta.url)], {
  durableObjects: { STATE_HOST: "StateHostObject" },
  wrap: (register) => verifies("cloudflare-durable.run-list-failures", register),
});
