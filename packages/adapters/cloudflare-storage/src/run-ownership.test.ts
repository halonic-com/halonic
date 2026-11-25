import { runSuitesInWorkerd } from "@halonicjs/target-cloudflare-testing";
import { verifies } from "@halonicjs/testing-spec";

// Who started each run, claimed in a real D1 database inside workerd.
await runSuitesInWorkerd([new URL("./run-ownership-cases.workerd.test.ts", import.meta.url)], {
  d1Databases: ["DB"],
  wrap: (register) => verifies("cloudflare-storage.run-ownership", register),
});
