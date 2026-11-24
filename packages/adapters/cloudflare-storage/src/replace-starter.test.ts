import { runSuitesInWorkerd } from "@halonicjs/target-cloudflare-testing";
import { verifies } from "@halonicjs/testing-spec";

// Replacing a deleted person's id in the organisations' run lists, against a real D1 database.
await runSuitesInWorkerd([new URL("./replace-starter-cases.workerd.test.ts", import.meta.url)], {
  d1Databases: ["DB"],
  wrap: (register) => verifies("cloudflare-storage.replace-starter", register),
});
