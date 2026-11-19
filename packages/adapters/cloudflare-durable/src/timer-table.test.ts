import { runSuitesInWorkerd } from "@halonicjs/target-cloudflare-testing";
import { verifies } from "@halonicjs/testing-spec";

// The timer table over a real Durable Object's SQLite storage, inside workerd.
await runSuitesInWorkerd([new URL("./test/timer-table.spec.ts", import.meta.url)], {
  durableObjects: { STATE_HOST: "StateHostObject" },
  wrap: (register) => verifies("cloudflare-durable.timers", register),
});
