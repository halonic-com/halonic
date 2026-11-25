import { runSuitesInWorkerd } from "@halonicjs/target-cloudflare-testing";
import { verifies } from "@halonicjs/testing-spec";

// The usage object's rate limit over a real Durable Object's storage, inside workerd.
await runSuitesInWorkerd([new URL("./test/usage-rate-scope.spec.ts", import.meta.url)], {
  durableObjects: { STATE_HOST: "StateHostObject" },
  wrap: (register) => verifies("cloudflare-durable.usage-rate", register),
});
