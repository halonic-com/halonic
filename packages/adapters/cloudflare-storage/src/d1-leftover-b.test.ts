import { runSuitesInWorkerd } from "@halonicjs/target-cloudflare-testing";

// Twin of d1-leftover-a.test.ts: each starts its own workerd and must find an empty database,
// though the other file wrote a table into its own. Whichever runs second shows nothing carried over.
await runSuitesInWorkerd([new URL("./d1-leftover.workerd.test.ts", import.meta.url)], {
  d1Databases: ["DB"],
});
