import { runSuitesInWorkerd } from "@halonicjs/target-cloudflare-testing";
import { verifies } from "@halonicjs/testing-spec";

// The watchdog inside workerd: one workerd per requirement, so each case is tagged with the
// requirement it proves.
await runSuitesInWorkerd([new URL("./test/watchdog.spec.ts", import.meta.url)], {
  wrap: (register) => verifies("cloudflare-durable.watchdog", register),
});

await runSuitesInWorkerd([new URL("./test/watchdog-limits.spec.ts", import.meta.url)], {
  wrap: (register) => verifies("cloudflare-durable.watchdog-limits", register),
});
