import { runSuitesInWorkerd } from "@halonicjs/target-cloudflare-testing";

// The real clock and the platform's own alarm, inside workerd. Takes about three seconds.
await runSuitesInWorkerd([new URL("./test/live-alarm.spec.ts", import.meta.url)], {
  durableObjects: { LIVE_RUNS: "LiveRunObject" },
});
