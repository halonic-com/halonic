import { runSuitesInWorkerd } from "@halonicjs/target-cloudflare-testing";

// The binding names are the ones wrangler.toml gives; the classes are the Worker's, with a clock
// the suite moves.
await runSuitesInWorkerd([new URL("./test/target.spec.ts", import.meta.url)], {
  d1Databases: ["DB"],
  r2Buckets: ["BLOBS", "DEFINITIONS"],
  durableObjects: {
    COORDINATION: "TestCoordinationObject",
    RUN: "TestRunObject",
    ROUTINES: "TestRoutinesObject",
  },
});
