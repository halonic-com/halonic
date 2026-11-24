import { runSuitesInWorkerd } from "@halonicjs/target-cloudflare-testing";
import { verifies } from "@halonicjs/testing-spec";

// The usage object over a real Durable Object's storage and alarm, inside workerd.
await runSuitesInWorkerd(
  [
    new URL("./test/usage-scope.spec.ts", import.meta.url),
    new URL("./test/usage-object.spec.ts", import.meta.url),
  ],
  {
    durableObjects: { STATE_HOST: "StateHostObject", USAGE: "UsageObject" },
    wrap: (register) => verifies("cloudflare-durable.usage-object", register),
  },
);
