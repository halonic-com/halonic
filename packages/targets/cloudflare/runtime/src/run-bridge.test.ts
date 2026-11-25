import { runSuitesInWorkerd } from "@halonicjs/target-cloudflare-testing";
import { verifies } from "@halonicjs/testing-spec";

// The binding names are the ones wrangler.toml gives. workerd here runs no containers, so the run
// container object is the one of a deployment whose configuration gives the class none.
await runSuitesInWorkerd([new URL("./test/run-bridge.spec.ts", import.meta.url)], {
  d1Databases: ["DB"],
  r2Buckets: ["BLOBS", "DEFINITIONS"],
  durableObjects: {
    COORDINATION: "CoordinationObject",
    RUN: "RunObject",
    ROUTINES: "RoutinesObject",
    RUN_CONTAINER: "RunContainerObject",
  },
  wrap: (register) => verifies("runtime.run-container-object", register),
});
