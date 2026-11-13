import { runSuitesInWorkerd } from "@halonicjs/target-cloudflare-testing";

// The Scheduler contract inside workerd, against the run object's real alarm.
await runSuitesInWorkerd([new URL("./test/scheduler.spec.ts", import.meta.url)], {
  durableObjects: { RUNS: "TestRunObject", ROUTINES: "TestRoutinesObject" },
});
