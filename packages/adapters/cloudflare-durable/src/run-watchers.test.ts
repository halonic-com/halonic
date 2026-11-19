import { runSuitesInWorkerd } from "@halonicjs/target-cloudflare-testing";
import { verifies } from "@halonicjs/testing-spec";

// Watching a run inside workerd, with its log in a real Durable Object's storage, and the
// watchers' streams as workerd runs them.
await runSuitesInWorkerd([new URL("./test/run-watchers.spec.ts", import.meta.url)], {
  durableObjects: { STATE_HOST: "StateHostObject" },
  wrap: (register) => verifies("cloudflare-durable.run-events", register),
});
