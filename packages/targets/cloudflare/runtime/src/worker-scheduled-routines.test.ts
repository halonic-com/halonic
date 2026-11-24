import { runSuitesInWorkerd } from "@halonicjs/target-cloudflare-testing";
import { verifies } from "@halonicjs/testing-spec";

// The binding names are the ones wrangler.toml gives; the routines object is the Worker's, on the
// suite's clock.
await runSuitesInWorkerd([new URL("./test/scheduled-routines.spec.ts", import.meta.url)], {
  d1Databases: ["DB"],
  r2Buckets: ["BLOBS", "DEFINITIONS"],
  durableObjects: {
    COORDINATION: "CoordinationObject",
    RUN: "RunObject",
    ROUTINES: "ClockedRoutinesObject",
  },
  wrap: (register) => verifies("runtime.scheduled-routines", register),
});
