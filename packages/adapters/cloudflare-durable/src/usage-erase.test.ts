import { runSuitesInWorkerd } from "@halonicjs/target-cloudflare-testing";
import { verifies } from "@halonicjs/testing-spec";

// A scope delete's erase of the usage object, inside workerd.
await runSuitesInWorkerd([new URL("./test/usage-erase.spec.ts", import.meta.url)], {
  durableObjects: { USAGE: "UsageObject" },
  wrap: (register) => verifies("cloudflare-durable.usage-erase", register),
});
