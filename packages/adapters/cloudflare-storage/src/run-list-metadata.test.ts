import { runSuitesInWorkerd } from "@halonicjs/target-cloudflare-testing";
import { verifies } from "@halonicjs/testing-spec";

// The run list's metadata, read from a real D1 database inside workerd.
await runSuitesInWorkerd([new URL("./run-list-metadata-cases.workerd.test.ts", import.meta.url)], {
  d1Databases: ["DB"],
  wrap: (register) => verifies("cloudflare-storage.run-list-metadata", register),
});
