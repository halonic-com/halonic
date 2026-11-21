import { runSuitesInWorkerd } from "@halonicjs/target-cloudflare-testing";
import { verifies } from "@halonicjs/testing-spec";

// The run log over a real Durable Object's SQLite storage, inside workerd.
await runSuitesInWorkerd([new URL("./test/run-log.spec.ts", import.meta.url)], {
  durableObjects: { STATE_HOST: "StateHostObject" },
  wrap: (register) => verifies("cloudflare-durable.run-log", register),
});
