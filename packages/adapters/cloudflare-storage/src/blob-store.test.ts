import { runSuitesInWorkerd } from "@halonicjs/target-cloudflare-testing";

// The BlobStore contract, run inside workerd over a real R2 binding.
await runSuitesInWorkerd([new URL("./blob-store.workerd.test.ts", import.meta.url)], {
  r2Buckets: ["BLOBS"],
});
