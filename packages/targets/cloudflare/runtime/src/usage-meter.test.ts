import { runSuitesInWorkerd } from "@halonicjs/target-cloudflare-testing";
import { verifies } from "@halonicjs/testing-spec";

// The Meter suite, and the meter's own cases, against a real `UsageObject` inside workerd.
await runSuitesInWorkerd([new URL("./test/usage-meter.spec.ts", import.meta.url)], {
  durableObjects: { USAGE: "ClockedUsageObject" },
  wrap: (register) => verifies("runtime.usage-meter", register),
});
