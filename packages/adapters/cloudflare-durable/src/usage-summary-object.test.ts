import { runSuitesInWorkerd } from "@halonicjs/target-cloudflare-testing";
import { verifies } from "@halonicjs/testing-spec";

// The usage object's summary over a real Durable Object's storage, inside workerd.
await runSuitesInWorkerd([new URL("./test/usage-summary.spec.ts", import.meta.url)], {
  durableObjects: { USAGE: "UsageObject" },
  wrap: (register) => verifies("cloudflare-durable.usage-summary", register),
});
