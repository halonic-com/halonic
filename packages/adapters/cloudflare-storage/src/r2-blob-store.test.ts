import { runSuitesInWorkerd } from "@halonicjs/target-cloudflare-testing";
import { verifies } from "@halonicjs/testing-spec";

// What the R2 blob store does to a real R2 bucket, run inside workerd: the keys and media types it
// writes, and when it doesn't call R2.
await runSuitesInWorkerd([new URL("./r2-blob-store-cases.workerd.test.ts", import.meta.url)], {
  r2Buckets: ["BLOBS"],
  wrap: (register) => verifies("cloudflare-storage.r2-blob-store", register),
});
