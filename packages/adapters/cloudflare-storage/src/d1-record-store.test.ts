import { runSuitesInWorkerd } from "@halonicjs/target-cloudflare-testing";
import { verifies } from "@halonicjs/testing-spec";

// The migration runner and the D1 record store on a real D1 database, run inside workerd: what the
// RecordStore contract doesn't reach, such as migrations that fail whole and compacts that overlap.
await runSuitesInWorkerd([new URL("./d1-record-store-cases.workerd.test.ts", import.meta.url)], {
  d1Databases: ["DB"],
  wrap: (register) => verifies("cloudflare-storage.d1-record-store", register),
});
