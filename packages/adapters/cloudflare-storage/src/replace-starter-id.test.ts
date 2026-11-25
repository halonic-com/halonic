import { runSuitesInWorkerd } from "@halonicjs/target-cloudflare-testing";
import { verifies } from "@halonicjs/testing-spec";

// `replaceStarter` refuses an id that isn't an end user's, against a real D1 database.
await runSuitesInWorkerd([new URL("./replace-starter-id-cases.workerd.test.ts", import.meta.url)], {
  d1Databases: ["DB"],
  wrap: (register) => verifies("cloudflare-storage.replace-starter-id", register),
});
