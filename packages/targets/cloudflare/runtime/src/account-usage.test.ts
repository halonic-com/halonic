import { runSuitesInWorkerd } from "@halonicjs/target-cloudflare-testing";
import { verifies } from "@halonicjs/testing-spec";

// The account menu's figures from a real `UsageObject` inside workerd.
await runSuitesInWorkerd([new URL("./test/account-usage.spec.ts", import.meta.url)], {
  durableObjects: { USAGE: "UsageObject" },
  wrap: (register) => verifies("runtime.account-usage", register),
});
