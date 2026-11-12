import { runSuitesInWorkerd } from "@halonicjs/target-cloudflare-testing";

// Twin of leftover-b.test.ts: each starts its own workerd and must find an empty bucket, though
// the other file wrote an object into its own. Whichever runs second shows nothing carried over.
await runSuitesInWorkerd([new URL("./leftover.workerd.test.ts", import.meta.url)], {
  r2Buckets: ["BLOBS"],
});
