import { runSuitesInWorkerd } from "@halonicjs/target-cloudflare-testing";
import { verifies } from "@halonicjs/testing-spec";

// The binding names are the ones wrangler.toml gives.
await runSuitesInWorkerd([new URL("./test/runtime.spec.ts", import.meta.url)], {
  d1Databases: ["DB"],
  r2Buckets: ["BLOBS", "DEFINITIONS"],
  durableObjects: {
    COORDINATION: "CoordinationObject",
    RUN: "RunObject",
    ROUTINES: "RoutinesObject",
  },
  wrap: (register) => verifies("runtime.configuration", register),
});
