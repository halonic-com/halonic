import { runSuitesInWorkerd } from "@halonicjs/target-cloudflare-testing";
import { verifies } from "@halonicjs/testing-spec";

// What the R2 definition source does with a real R2 bucket, run inside workerd: which version it
// serves, and what it refuses.
await runSuitesInWorkerd(
  [new URL("./r2-definition-source-cases.workerd.test.ts", import.meta.url)],
  {
    r2Buckets: ["DEFINITIONS"],
    wrap: (register) => verifies("cloudflare-storage.r2-definition-source", register),
  },
);
