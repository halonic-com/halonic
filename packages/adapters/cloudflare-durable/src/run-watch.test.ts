import { runSuitesInWorkerd } from "@halonicjs/target-cloudflare-testing";

// Watching a run through the run object's RPC, inside workerd.
await runSuitesInWorkerd([new URL("./test/run-watch.spec.ts", import.meta.url)], {
  durableObjects: { RUNS: "TestRunObject" },
});
