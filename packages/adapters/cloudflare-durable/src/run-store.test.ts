import { runSuitesInWorkerd } from "@halonicjs/target-cloudflare-testing";

// The RunStore contract inside workerd, against the run object, its outbox and a real D1 run list.
await runSuitesInWorkerd([new URL("./test/run-store.spec.ts", import.meta.url)], {
  durableObjects: { RUNS: "TestRunObject" },
  d1Databases: ["DB"],
});
