import { runSuitesInWorkerd } from "@halonicjs/target-cloudflare-testing";
import { verifies } from "@halonicjs/testing-spec";

// The scopes with open runs, read from a real D1 database inside workerd.
await runSuitesInWorkerd([new URL("./open-run-scopes-cases.workerd.test.ts", import.meta.url)], {
  d1Databases: ["DB"],
  wrap: (register) => verifies("cloudflare-storage.open-run-scopes", register),
});
