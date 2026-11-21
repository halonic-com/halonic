import { runSuitesInWorkerd } from "@halonicjs/target-cloudflare-testing";
import { verifies } from "@halonicjs/testing-spec";

// The D1 run list against a real D1 database, run inside workerd.
await runSuitesInWorkerd([new URL("./d1-run-list-cases.workerd.test.ts", import.meta.url)], {
  d1Databases: ["DB"],
  wrap: (register) => verifies("cloudflare-storage.d1-run-list", register),
});
