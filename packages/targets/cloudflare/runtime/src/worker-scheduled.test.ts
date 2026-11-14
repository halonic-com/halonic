import { runSuitesInWorkerd } from "@halonicjs/target-cloudflare-testing";
import { verifies } from "@halonicjs/testing-spec";

// The binding names are the ones wrangler.toml gives; the routines object is the test's own subclass.
await runSuitesInWorkerd([new URL("./test/scheduled.spec.ts", import.meta.url)], {
  d1Databases: ["DB"],
  r2Buckets: ["BLOBS", "DEFINITIONS"],
  durableObjects: {
    COORDINATION: "CoordinationObject",
    RUN: "RunObject",
    ROUTINES: "TickedRoutinesObject",
  },
  wrap: (register) => verifies("runtime.scheduled", register),
});
