import { runSuitesInWorkerd } from "@halonicjs/target-cloudflare-testing";
import { verifies } from "@halonicjs/testing-spec";

// The binding names are the ones wrangler.toml gives; the run object is the Worker's, with a way
// for the spec to run its alarm.
await runSuitesInWorkerd([new URL("./test/run-list.spec.ts", import.meta.url)], {
  d1Databases: ["DB"],
  r2Buckets: ["BLOBS", "DEFINITIONS"],
  durableObjects: {
    COORDINATION: "CoordinationObject",
    RUN: "AlarmRunObject",
    ROUTINES: "RoutinesObject",
  },
  wrap: (register) => verifies("runtime.run-list", register),
});
