import { runSuitesInWorkerd } from "@halonicjs/target-cloudflare-testing";

// The RecordStore and TokenStore contracts, and the injection cases, run inside workerd over a
// real D1 database.
await runSuitesInWorkerd(
  [
    new URL("./record-store.workerd.test.ts", import.meta.url),
    new URL("./record-store-injection.workerd.test.ts", import.meta.url),
  ],
  { d1Databases: ["DB"] },
);
