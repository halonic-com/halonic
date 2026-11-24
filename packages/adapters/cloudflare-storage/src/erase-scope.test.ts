import { runSuitesInWorkerd } from "@halonicjs/target-cloudflare-testing";
import { verifies } from "@halonicjs/testing-spec";

// Erasing a scope's blobs, records and run list rows, against a real R2 bucket and D1 database.
await runSuitesInWorkerd([new URL("./erase-scope-cases.workerd.test.ts", import.meta.url)], {
  d1Databases: ["DB"],
  r2Buckets: ["BLOBS"],
  wrap: (register) => verifies("cloudflare-storage.erase-scope", register),
});
